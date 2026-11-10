"""API de Puriq Lite (FastAPI) + archivos de la app web.

    uvicorn backend.main:app --reload
"""
from __future__ import annotations

import os
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from urllib.parse import quote

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from ai import transcribir as asr
from ai import visita as ia
from . import ficha3, rules
from .routing import planificar, prioridad
from .store import STORE

RAIZ = Path(__file__).resolve().parents[1]
WEB = RAIZ / "app" / "dist" if (RAIZ / "app" / "dist" / "index.html").exists() else RAIZ / "app"
MAX_AUDIO = 15 * 1024 * 1024
AGENTE, CELULAR_AGENTE = "Rosa Huamán", "51911111111"  # agente ficticia del demo

@asynccontextmanager
async def _vida(_app: FastAPI):
    if os.getenv("WHISPER_PRELOAD", "1") == "1":
        asr.precargar()  # carga Whisper en segundo plano para que la primera grabación no espere
    yield


app = FastAPI(title="Puriq Lite", version="0.1.0", docs_url="/api/docs", redoc_url=None, lifespan=_vida)


def _gestante(gid: str) -> dict:
    if gid not in STORE.gestantes:
        raise HTTPException(404, "Gestante no encontrada")
    return STORE.gestantes[gid]


def _con_prioridad(r: dict) -> dict:
    p = prioridad(r)
    return {**r, "prioridad": {"puntaje": p.puntaje, "nivel": p.nivel, "razones": p.razones}}


# ─────────────────────────────── lectura
@app.get("/api/estado")
def estado():
    return {**STORE.meta, "hoy": STORE.hoy.isoformat(), "agente": f"{AGENTE} (agente comunitaria)", "eess": STORE.inicio["nombre"],
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
@app.post("/api/visita/transcribir")
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


@app.post("/api/visita/extraer")
def extraer(body: Texto):
    _gestante(body.gestante_id)
    return ia.extraer(body.texto)


class Campos(BaseModel):
    gestante_id: str
    campos: dict
    transcripcion: str = ""


def _pendientes_control(gid: str) -> bool:
    return any(s["tipo"] == "cpn" and s["estado"] in ("rojo", "verde") for s in STORE.servicios(STORE.gestantes[gid]))


@app.post("/api/visita/mensajes")
def mensajes(body: Campos):
    g = _gestante(body.gestante_id)
    r = STORE.resumen(g)
    sel = ficha3.seleccionar_mensajes(body.campos, r["trimestre"], _pendientes_control(body.gestante_id))
    red = ia.redactar(g["nombre"], r["semana"], sel["mensajes"], body.transcripcion, sel["urgente"])
    derivacion = None
    if sel["urgente"]:
        # Signos de alarma: el agente no atiende, deriva. Se envía al EESS por WhatsApp de forma automática.
        # Versión Lite: el envío se simula y se ofrece el enlace wa.me; la versión completa usa la API
        # de WhatsApp Business para enviarlo sin intervención.
        hora = datetime.now().strftime("%H:%M")
        eess = STORE.inicio
        texto = ficha3.texto_derivacion(r, sel["signos_alarma"], AGENTE, CELULAR_AGENTE, eess["nombre"], hora)
        derivacion = STORE.registrar_derivacion(body.gestante_id, {
            "para": eess["nombre"], "contacto": eess.get("contacto", ""), "numero": eess.get("whatsapp", ""),
            "signos": sel["signos_alarma"], "texto": texto,
            "enlace": f"https://wa.me/{eess.get('whatsapp', '')}?text={quote(texto)}", "simulada": True,
        })
    return {**sel, **red, "derivacion": derivacion, "trimestre": r["trimestre"], "semana": r["semana"]}


class Guardar(BaseModel):
    gestante_id: str
    campos: dict
    urgente: bool = False
    referencias: list[str] = []
    mensajes: list[dict] = []
    compromiso: str = ""
    resumen: str = ""
    duracion_s: int | None = None


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
