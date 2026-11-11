"""IA de la visita: de la transcripción a la Ficha 3 (parte C) y a los mensajes para la gestante.

Dos pasos, cada uno con una llamada a Claude con salida estructurada (JSON Schema):
  1. extraer(): lee la conversación y marca cada campo como "si" / "no" / "nm" (no mencionado),
     con la frase que lo respalda. Lo que no se dijo queda "nm": la IA no inventa.
  2. redactar(): los mensajes YA ELEGIDOS por reglas (backend/ficha3.py) se reescriben en
     lenguaje sencillo, en segunda persona, conectados con lo que dijo la gestante.

Si no hay ANTHROPIC_API_KEY o la llamada falla, se usa un respaldo por palabras clave y los
textos base: el demo nunca se queda colgado.

Variables de entorno: ANTHROPIC_API_KEY, CLAUDE_MODEL (default claude-opus-5-5).
"""
from __future__ import annotations

import json
import os
import re
import unicodedata

from backend.ficha3 import HABITOS, MOTIVOS_NO_CONSUMO, SIGNOS_ALARMA, SUPLEMENTOS

MODELO = os.getenv("CLAUDE_MODEL", "claude-opus-5-5")
VALOR = {"type": "string", "enum": ["si", "no", "nm"]}


def _obj(props: dict) -> dict:
    return {"type": "object", "properties": props, "required": list(props), "additionalProperties": False}


def _campo() -> dict:
    return _obj({"valor": VALOR, "evidencia": {"type": "string"}})


ESQUEMA_FICHA = _obj({
    "suplementos": _obj({k: _campo() for k in SUPLEMENTOS}),
    "motivos": {"type": "array", "items": {"type": "string", "enum": list(MOTIVOS_NO_CONSUMO)}},
    "signos": _obj({k: _campo() for k in SIGNOS_ALARMA}),
    "habitos": _obj({k: _campo() for k in HABITOS}),
    "resumen": {"type": "string"},
})

ESQUEMA_MENSAJES = _obj({
    "mensajes": {"type": "array", "items": _obj({"id": {"type": "string"}, "decir": {"type": "string"}})},
    "cierre": {"type": "string"},
})

SISTEMA_FICHA = """Eres el asistente de un agente comunitario de salud del Perú que visita gestantes en su casa.
Recibes la transcripción automática (puede tener errores) de una visita domiciliaria y llenas la parte C de la
Ficha 3 de visita a la gestante (RM 241-2024-MINSA).

Reglas:
- Para cada campo responde "si", "no" o "nm" (no mencionado). Usa "nm" si en la conversación no se habló de eso.
  No supongas nada que no se haya dicho.
- suplementos: "si" si la gestante dice que los toma; "no" si dice que no los toma o los dejó.
- motivos: solo si dijo por qué no toma algún suplemento.
- signos: "si" si la gestante dice que tiene o tuvo ese síntoma en estos días; "no" si lo niega.
- habitos: "si" si dice que lo practica o lo come; "no" si dice que no o casi nunca.
- evidencia: copia la frase corta de la transcripción que respalda el valor ("" si es "nm").
- resumen: 1 o 2 oraciones neutras de lo encontrado, para el registro del agente."""

SISTEMA_MENSAJES = """Eres el asistente de un agente comunitario de salud en Quinua, Ayacucho (Perú).
Te paso los mensajes de orientación que el agente debe dar a una gestante, ya elegidos según la norma.
Reescribe cada uno como lo diría el agente: en español sencillo, cálido, de "usted", máximo 2 oraciones,
mencionando lo que la gestante contó cuando venga al caso. No agregues indicaciones médicas nuevas, dosis ni
diagnósticos: solo reformula el contenido que te paso. Si hay signos de alarma, el primer mensaje debe decir con
claridad que vaya hoy mismo al establecimiento de salud. "cierre": una frase para pedirle un compromiso sencillo."""


def _cliente():
    if not os.getenv("ANTHROPIC_API_KEY"):
        return None
    import anthropic

    return anthropic.Anthropic(timeout=60, max_retries=1)


def _llamar(sistema: str, usuario: str, esquema: dict, max_tokens: int = 4000) -> dict | None:
    """Una llamada con salida estructurada. Devuelve el JSON o None si no se pudo."""
    cliente = _cliente()
    if cliente is None:
        return None
    import anthropic

    try:
        r = cliente.beta.messages.create(
            model=MODELO,
            max_tokens=max_tokens,
            system=sistema,
            messages=[{"role": "user", "content": usuario}],
            output_config={"effort": "low", "format": {"type": "json_schema", "schema": esquema}},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
    except (anthropic.APIConnectionError, anthropic.RateLimitError, anthropic.APIStatusError) as e:
        print(f"[ia] error de API: {type(e).__name__}: {e}")
        return None
    if r.stop_reason in ("refusal", "max_tokens"):
        print(f"[ia] respuesta no utilizable: stop_reason={r.stop_reason}")
        return None
    texto = next((b.text for b in r.content if b.type == "text"), "")
    try:
        return json.loads(texto)
    except json.JSONDecodeError:
        print("[ia] JSON inválido")
        return None


# ─────────────────────────────── respaldo sin IA (palabras clave)
def _norm(s: str) -> str:
    s = unicodedata.normalize("NFD", s.lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


CLAVES_SIGNOS = {
    # Castellano coloquial de la zona y algunas frases en quechua. Ante la duda, mejor detectar de más.
    "vision_cefalea": r"dolor de cabeza|duele (mucho |bastante )?(la )?cabeza|veo borroso|vision borrosa|veo (lucecitas|estrellitas|nublado|oscuro)|umay\w* nana",
    "bebe_no_se_mueve": r"no se mueve|no (lo |la )?siento (que se )?m(o|ue)v|casi no se mueve|se mueve poco|no se ha movido|wawa\w* mana kuyu",
    "perdida_liquido": r"\bliquido\b|aguita|agua por abajo|rompio la fuente|me mojo|se me salio (el )?agua",
    "hinchazon": r"hinch|punki",
    "sangrado": r"sangr(?!ecita)|manch|yawar",
    "dolor_contracciones": r"contraccion|dolor de barriga|duele (mucho |bastante )?(la )?barriga|duele (mucho )?el vientre|se me endurece|wiksa\w* nana",
}
# Negación pegada al signo ("no tengo dolor de cabeza", "sangrado no", "líquido tampoco").
_NEG_ANTES = re.compile(r"\b(no|nunca|ningun\w*|nada de)\s+(\w+\s+){0,2}$")
_NEG_DESPUES = re.compile(r"^\w*[\s,]*(no|tampoco|nada|nunca)\b")
CLAVES_MOTIVOS = {
    "tragar": r"tragar", "estrenimiento": r"estren|me cae mal|malestar", "se_acabo": r"se me acab|ya no tengo",
    "no_le_dieron": r"no me dieron", "nauseas": r"nausea|asco|vomit|no me gusta", "sabor": r"sabor|olor",
}


def _respaldo_extraer(texto: str) -> dict:
    t = _norm(texto)
    # Sin hablantes separados: se descartan las frases que parecen preguntas de la agente.
    pregunta = re.compile(r"[¿?]|^(y )?(esta|ha|se lava|come|tiene|el bebe se mueve bien|que come)\b")
    frases = [f for f in re.split(r"(?<=[.!?])\s+", t) if not pregunta.search(f.strip())]

    def cerca(patron: str) -> tuple[str, str]:
        for f in frases:
            if re.search(patron, f):
                neg = re.search(r"\bno\b|\bnunca\b|\bnada\b|\bya no\b", f)
                return ("no" if neg else "si"), f[:120]
        return "nm", ""

    sup = {}
    for k, pat in {"af_fe": r"acido folico", "fe": r"hierro|sulfato", "calcio": r"calcio"}.items():
        v, ev = cerca(pat)
        sup[k] = {"valor": v, "evidencia": ev}
    signos = {}
    for k, pat in CLAVES_SIGNOS.items():
        hallado = next(((f, m) for f in frases if (m := re.search(pat, f))), None)
        if hallado is None:
            signos[k] = {"valor": "nm", "evidencia": ""}
        else:
            f, m = hallado
            # "no se mueve" es el propio signo; en los demás, solo niega un "no" pegado al signo.
            neg = k != "bebe_no_se_mueve" and (
                _NEG_ANTES.search(f[max(0, m.start() - 20):m.start()]) or _NEG_DESPUES.search(f[m.end():m.end() + 14]))
            signos[k] = {"valor": "no" if neg else "si", "evidencia": f[:120]}
    hab = {}
    for k, pat in {"frutas_verduras": r"fruta|verdura", "cepillado": r"cepill|dientes",
                   "lavado_manos": r"lav\w* las manos|lavo mis manos", "carnes": r"carne|pollo|pescado",
                   "sangrecita": r"sangrecita|higado|bazo"}.items():
        v, ev = cerca(pat)
        hab[k] = {"valor": v, "evidencia": ev}
    motivos = [k for k, pat in CLAVES_MOTIVOS.items() if re.search(pat, t)] if any(
        v["valor"] == "no" for v in sup.values()) else []
    return {"suplementos": sup, "motivos": motivos, "signos": signos, "habitos": hab,
            "resumen": "Registro generado por palabras clave (sin IA). Revise cada campo."}


# ─────────────────────────────── API del módulo
def extraer(texto: str) -> dict:
    datos = _llamar(SISTEMA_FICHA, f"Transcripción de la visita:\n\n{texto}", ESQUEMA_FICHA)
    fuente = "ia"
    if datos is None:
        datos, fuente = _respaldo_extraer(texto), "reglas"
    datos["fuente"] = fuente
    return datos


def redactar(nombre: str, semana: int, mensajes: list[dict], transcripcion: str, urgente: bool) -> dict:
    """Devuelve {mensajes: [{id, titulo, texto, decir, origen}], cierre, fuente}."""
    base = [{**m, "decir": m["texto"]} for m in mensajes]
    cierre_base = "¿Se compromete a tomar su tableta todos los días y a ir a su próximo control?"
    if not mensajes:
        return {"mensajes": [], "cierre": cierre_base, "fuente": "reglas"}
    pedido = json.dumps({
        "gestante": nombre.split()[0], "semana_gestacion": semana, "hay_signos_de_alarma": urgente,
        "mensajes": [{"id": m["id"], "tema": m["titulo"], "contenido": m["texto"]} for m in mensajes],
        "lo_que_conto_la_gestante": transcripcion[-3000:],
    }, ensure_ascii=False)
    datos = _llamar(SISTEMA_MENSAJES, pedido, ESQUEMA_MENSAJES)
    if not datos:
        return {"mensajes": base, "cierre": cierre_base, "fuente": "reglas"}
    decir = {m["id"]: m["decir"] for m in datos.get("mensajes", []) if m.get("decir")}
    return {"mensajes": [{**m, "decir": decir.get(m["id"], m["texto"])} for m in mensajes],
            "cierre": datos.get("cierre") or cierre_base, "fuente": "ia"}
