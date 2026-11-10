"""Voz a texto con faster-whisper (Whisper en CTranslate2, int8 en CPU), como en la sesión 13.

El audio de la visita no sale del servidor: el modelo corre ahí mismo. El primer uso descarga
el modelo de Hugging Face (~460 MB para "small") y luego queda en caché.

Variables de entorno:
    WHISPER_MODEL   tamaño del modelo (default "small"; "base" es más rápido, "large-v3-turbo" más preciso)
"""
from __future__ import annotations

import io
import os
import threading
import time
from functools import lru_cache

_lock = threading.Lock()


@lru_cache(maxsize=1)
def _modelo():
    from faster_whisper import WhisperModel  # import tardío: el servidor arranca rápido

    nombre = os.getenv("WHISPER_MODEL", "small")
    return WhisperModel(nombre, device="cpu", compute_type="int8")


def transcribir(audio: bytes) -> dict:
    """Transcribe audio (webm/ogg/wav/mp3/m4a) en español. Devuelve texto, segundos de audio y de proceso."""
    t0 = time.time()
    with _lock:  # un solo modelo compartido; CPU chica
        segmentos, info = _modelo().transcribe(
            io.BytesIO(audio), language="es", vad_filter=True, beam_size=1,
            initial_prompt="Visita domiciliaria a una gestante en Quinua, Ayacucho. "
                           "Hierro, ácido fólico, calcio, sangrecita, control prenatal, signos de alarma.",
        )
        texto = " ".join(s.text.strip() for s in segmentos).strip()
    return {"texto": texto, "duracion_audio_s": round(info.duration, 1), "proceso_s": round(time.time() - t0, 1),
            "modelo": os.getenv("WHISPER_MODEL", "small")}


def precargar() -> None:
    """Carga el modelo en segundo plano al iniciar, para que la primera grabación no espere."""
    threading.Thread(target=_modelo, daemon=True).start()
