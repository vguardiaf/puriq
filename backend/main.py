"""API de Puriq Lite (FastAPI) + archivos de la app web.

    uvicorn backend.main:app --reload
"""
from __future__ import annotations

import os
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from urllib.parse import quote

from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from ai import transcribir as asr
from ai import visita as ia
from . import auth, ficha3, rules
from .routing import planificar, prioridad
from .store import STORE

RAIZ = Path(__file__).resolve().parents[1]
WEB = RAIZ / "app" / "dist" if (RAIZ / "app" / "dist" / "index.html").exists() else RAIZ / "app"
MAX_AUDIO = 15 * 1024 * 1024
AGENTE, CELULAR_AGENTE = "Rosa Huamán", "51911111111"  # agente ficticia del demo
LIMITE_POR_MIN = int(os.getenv("LIMITE_POR_MIN", "20"))
_llamadas: dict[str, deque] = defaultdict(deque)


def _limite(request: Request) -> None:
    """Límite simple por IP para Whisper y la IA: evita abuso de CPU y gasto de API en el demo público."""
    ip = request.client.host if request.client else "?"
    q, ahora = _llamadas[ip], time.time()
    while q and ahora - q[0] > 60:
        q.popleft()
    if len(q) >= LIMITE_POR_MIN:
        raise HTTPException(429, "Demasiadas solicitudes. Espere un minuto.")
    q.append(ahora)

@asynccontextmanager
async def _vida(_app: FastAPI):
    if os.getenv("WHISPER_PRELOAD", "1") == "1":
        asr.precargar()  # carga Whisper en segundo plano para que la primera grabación no espere
    yield


app = FastAPI(title="Puriq Lite", version="0.1.0", docs_url="/api/docs", redoc_url=None, lifespan=_vida)

ABIERTAS = ("/api/auth/activar", "/api/docs")


@app.middleware("http")
async def _exigir_token(request: Request, call_next):
    """Toda la API pide el token del celular activado por la posta (el PIN se verifica en el celular)."""
    ruta = request.url.path
    if ruta.startswith("/api/") and not ruta.startswith(ABIERTAS):
        if not auth.verificar(request.headers.get("x-token")):
            return JSONResponse({"detail": "Active su celular con el código de la posta."}, status_code=401)
    return await call_next(request)


class Activacion(BaseModel):
    codigo: str = Field(min_length=4, max_length=12)


@app.post("/api/auth/activar", dependencies=[Depends(_limite)])
def activar(body: Activacion):
    r = auth.activar(body.codigo)
    if not r:
        raise HTTPException(401, "Código no válido. Pida uno nuevo a la posta.")
    return r


class Revocar(BaseModel):
    token: str


@app.post("/api/auth/revocar")
def revocar(body: Revocar):
    """La posta desactiva un celular (en la versión completa, solo desde su panel)."""
    return {"ok": auth.revocar(body.token)}


def _gestante(gid: str) -> dict:
    if gid not in STORE.gestantes:
        raise HTTPException(404, "Gestante no encontrada")
    return STORE.gestantes[gid]


def _con_prioridad(r: dict) -> dict:
    p = prioridad(r)
    return {**r, "prioridad": {"puntaje": p.puntaje, "nivel": p.nivel, "razones": p.razones}}


# ─────────────────────────────── lectura
@app.get("/api/estado")
def estado(request: Request):
    yo = auth.verificar(request.headers.get("x-token")) or {"nombre": AGENTE}
    return {**STORE.meta, "hoy": STORE.hoy.isoformat(), "agente": f"{yo['nombre']} (agente comunitaria)", "eess": STORE.inicio["nombre"], "telefono_posta": "+" + STORE.inicio.get("whatsapp", ""),
            "ia": bool(os.getenv("ANTHROPIC_API_KEY")), "modelo_ia": ia.MODELO,
            "whisper": os.getenv("WHISPER_MODEL", "small"), "version": "Lite"}


@app.get("/api/gestantes")
def gestantes():
    return [_con_prioridad(STORE.resumen(g)) for g in STORE.gestantes.values()]


@app.get("/api/gestantes/{gid}")
def gestante(gid: str):
    _gestante(gid)
    return _con_prioridad(STORE.detalle(gid))


@app.get("/api/ruta")
def ruta(jornada: int = 240, hora: str = "08:00"):
    if not 60 <= jornada <= 600:
        raise HTTPException(422, "La jornada debe estar entre 60 y 600 minutos")
    return planificar([STORE.resumen(g) for g in STORE.gestantes.values()], STORE.inicio, jornada, hora)


@app.get("/api/ficha3/catalogo")
def catalogo():
    return ficha3.catalogo()


# ─────────────────────────────── servicios entregados
class Entrega(BaseModel):
    fecha: str | None = None


@app.post("/api/gestantes/{gid}/servicios/{sid}")
def entregar(gid: str, sid: str, body: Entrega):
    _gestante(gid)
    if sid not in rules.SERVICIO_POR_ID:
        raise HTTPException(404, "Servicio no encontrado")
    return _con_prioridad(STORE.registrar_entrega(gid, sid, body.fecha))


@app.delete("/api/gestantes/{gid}/servicios/{sid}")
def deshacer(gid: str, sid: str):
    _gestante(gid)
    return _con_prioridad(STORE.deshacer_entrega(gid, sid))


class PlanParto(BaseModel):
    marcados: list[str] = []


@app.post("/api/gestantes/{gid}/plan-parto")
def plan_parto(gid: str, body: PlanParto):
    """Verificación del plan de parto (III trimestre). Completo = servicio 'Plan de parto' entregado."""
    g = _gestante(gid)
    if STORE.resumen(g)["trimestre"] != 3:
        raise HTTPException(422, "El plan de parto se verifica en el III trimestre")
    return _con_prioridad(STORE.guardar_plan_parto(gid, body.marcados))


# ─────────────────────────────── visita domiciliaria (Ficha 3)
@app.post("/api/visita/transcribir", dependencies=[Depends(_limite)])
async def transcribir(audio: UploadFile = File(...)):
    datos = await audio.read()
    if not datos:
        raise HTTPException(422, "El audio llegó vacío")
    if len(datos) > MAX_AUDIO:
        raise HTTPException(413, "El audio es muy largo para la versión Lite (máx. 15 MB)")
    try:
        return asr.transcribir(datos)
    except Exception as e:  # audio corrupto o formato no soportado
        raise HTTPException(422, f"No se pudo transcribir el audio: {type(e).__name__}") from e


class Texto(BaseModel):
    gestante_id: str
    texto: str = Field(min_length=10, max_length=20000)


@app.post("/api/visita/extraer", dependencies=[Depends(_limite)])
def extraer(body: Texto):
    _gestante(body.gestante_id)
    return ia.extraer(body.texto)


class Campos(BaseModel):
    gestante_id: str
    campos: dict
    transcripcion: str = ""


def _pendientes_control(gid: str) -> bool:
    return any(s["tipo"] == "cpn" and s["estado"] in ("rojo", "verde") for s in STORE.servicios(STORE.gestantes[gid]))


@app.post("/api/visita/mensajes", dependencies=[Depends(_limite)])
def mensajes(body: Campos):
    g = _gestante(body.gestante_id)
    r = STORE.resumen(g)
    sel = ficha3.seleccionar_mensajes(body.campos, r["trimestre"], _pendientes_control(body.gestante_id))
    red = ia.redactar(g["nombre"], r["semana"], sel["mensajes"], body.transcripcion, sel["urgente"])
    derivacion = None
    if sel["urgente"]:
        # Signos de alarma: la promotora no atiende, avisa. La app prepara un mensaje corto y ella lo manda
        # desde SU celular: WhatsApp (con datos), SMS (sin datos) o llamada (su app de llamadas).
        hora = datetime.now().strftime("%H:%M")
        eess = STORE.inicio
        num = eess.get("whatsapp", "")
        texto = ficha3.texto_derivacion(r, sel["signos_alarma"], AGENTE, hora)
        derivacion = {
            "para": eess["nombre"], "numero": num, "texto": texto, "signos": sel["signos_alarma"],
            "whatsapp": f"https://wa.me/{num}?text={quote(texto)}",
            "sms": f"sms:+{num}?body={quote(texto)}",
            "tel": f"tel:+{num}",
            "avisos": STORE.avisos_de_hoy(body.gestante_id),
        }
    return {**sel, **red, "derivacion": derivacion, "trimestre": r["trimestre"], "semana": r["semana"]}


class Aviso(BaseModel):
    gestante_id: str
    canal: str = Field(pattern="^(whatsapp|sms|llamada)$")


@app.post("/api/visita/aviso")
def aviso(body: Aviso):
    """La promotora tocó WhatsApp, SMS o Llamar: se registra para el seguimiento de la derivación."""
    _gestante(body.gestante_id)
    return STORE.registrar_aviso(body.gestante_id, body.canal)


class Guardar(BaseModel):
    gestante_id: str
    campos: dict
    urgente: bool = False
    referencias: list[str] = []
    mensajes: list[dict] = []
    compromiso: str = ""
    resumen: str = ""
    duracion_s: int | None = None
    consentimiento: bool | None = None


@app.post("/api/visita/guardar")
def guardar(body: Guardar):
    _gestante(body.gestante_id)
    visita = body.model_dump(exclude={"gestante_id"})
    visita["derivada"] = body.urgente
    visita["mensajes"] = [m.get("titulo", "") for m in body.mensajes]
    return _con_prioridad(STORE.registrar_visita(body.gestante_id, visita))


# ─────────────────────────────── demo
EJEMPLO = (RAIZ / "data" / "visita_ejemplo.txt")


@app.get("/api/demo/ejemplo")
def ejemplo():
    audio = RAIZ / "data" / "visita_ejemplo.wav"
    return {"texto": EJEMPLO.read_text(encoding="utf-8") if EJEMPLO.exists() else "",
            "audio": "/api/demo/audio" if audio.exists() else None}


@app.get("/api/demo/audio")
def ejemplo_audio():
    audio = RAIZ / "data" / "visita_ejemplo.wav"
    if not audio.exists():
        raise HTTPException(404)
    return FileResponse(audio, media_type="audio/wav")


@app.post("/api/demo/reiniciar")
def reiniciar():
    STORE.reiniciar()
    return {"ok": True}


# ─────────────────────────────── app web (al final, para no tapar /api)
app.mount("/", StaticFiles(directory=WEB, html=True), name="web")
