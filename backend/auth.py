"""Acceso de la promotora (versión Lite).

Diseño pensado para promotoras con poca lectura y celular compartido:
- La POSTA da de alta a la promotora y le entrega un código de activación (no hay "crear cuenta",
  ni correo, ni contraseña).
- Con ese código se activa SU celular una sola vez: el servidor devuelve un token firmado.
- Para entrar cada día usa un PIN de 4 números. El PIN se verifica EN EL CELULAR (funciona sin
  señal) y nunca viaja al servidor; lo que viaja es el token.
- La posta puede desactivar un celular (perdido o promotora que se retira).

Token: "<agente>.<dispositivo>.<firma HMAC-SHA256>" (sin estado en el servidor: sobrevive reinicios).
"""
from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import threading

SECRETO = os.getenv("PURIQ_SECRETO", "solo-para-demo-cambiar-en-produccion").encode()

# Promotoras dadas de alta por la posta (demo). El código lo entrega la posta en persona.
AGENTES = {
    "A01": {"id": "A01", "nombre": "Rosa Huamán", "posta": "Puesto de Salud Quinua",
            "codigo": os.getenv("PURIQ_CODIGO_DEMO", "482913")},
}
_revocados: set[str] = set()
_lock = threading.Lock()


def _firma(agente: str, dispositivo: str) -> str:
    return hmac.new(SECRETO, f"{agente}.{dispositivo}".encode(), hashlib.sha256).hexdigest()[:32]


def activar(codigo: str) -> dict | None:
    """Código de la posta -> token del celular + datos para el saludo. None si el código no vale."""
    agente = next((a for a in AGENTES.values() if hmac.compare_digest(a["codigo"], codigo.strip())), None)
    if not agente:
        return None
    dispositivo = secrets.token_hex(8)
    return {"token": f"{agente['id']}.{dispositivo}.{_firma(agente['id'], dispositivo)}",
            "agente": perfil(agente["id"])}


def verificar(token: str | None) -> dict | None:
    """Devuelve el perfil de la promotora si el token es válido y el celular no fue desactivado."""
    if not token or token.count(".") != 2:
        return None
    agente, dispositivo, firma = token.split(".")
    if agente not in AGENTES or dispositivo in _revocados:
        return None
    if not hmac.compare_digest(firma, _firma(agente, dispositivo)):
        return None
    return perfil(agente)


def revocar(token: str) -> bool:
    """La posta desactiva un celular."""
    if not verificar(token):
        return False
    with _lock:
        _revocados.add(token.split(".")[1])
    return True


def perfil(agente_id: str) -> dict:
    a = AGENTES[agente_id]
    return {"id": a["id"], "nombre": a["nombre"], "posta": a["posta"],
            "iniciales": "".join(p[0] for p in a["nombre"].split()[:2]).upper()}
