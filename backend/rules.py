"""Reglas del semáforo de servicios de la gestante (portadas del mockup Creciendo Juntos).

Cada servicio tiene una ventana en MESES DE GESTACIÓN. Un mes de gestación se define por
semanas (tabla GEST_START_WK / GEST_END_WK). Estados posibles de un servicio:

    rec   entregado (siempre prevalece)
    fut   más adelante: todavía no le toca
    verde servicio próximo: hoy está dentro de su ventana (genera recordatorio)
    amar  pendiente: venció, pero se recupera hasta el parto (genera alerta)
    rojo  perdido: venció y ya no se recupera
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

GEST_START_WK = [1, 5, 9, 14, 18, 22, 27, 31, 36]
GEST_END_WK = [4, 8, 13, 17, 21, 26, 30, 35, 40]
FE = "Hierro y ácido fólico"


@dataclass(frozen=True)
class Servicio:
    id: str
    tipo: str
    nombre: str
    mes_desde: int
    mes_hasta: int
    recupera_hasta_parto: bool


SERVICIOS = [
    Servicio("cpn1", "cpn", "1.er control prenatal", 1, 3, False),
    Servicio("orina", "orina", "Examen de orina", 1, 3, True),
    Servicio("hb", "hb", "Examen de hemoglobina", 1, 3, True),
    Servicio("vih", "vih", "Examen de VIH", 1, 3, True),
    Servicio("sif", "sif", "Examen de sífilis", 1, 3, True),
    Servicio("cpn2", "cpn", "Control prenatal 2", 4, 5, False),
    Servicio("fe2", "fe", FE, 4, 5, False),
    Servicio("cpn3", "cpn", "Control prenatal 3", 6, 6, False),
    Servicio("fe3", "fe", FE, 6, 6, False),
    Servicio("cpn4", "cpn", "Control prenatal 4", 7, 7, False),
    Servicio("fe4", "fe", FE, 7, 7, False),
    Servicio("cpn5", "cpn", "Control prenatal 5", 8, 8, False),
    Servicio("fe5", "fe", FE, 8, 8, False),
    Servicio("cpn6", "cpn", "Control prenatal 6", 9, 9, False),
    Servicio("fe6", "fe", FE, 9, 9, False),
]
SERVICIO_POR_ID = {s.id: s for s in SERVICIOS}


def semana_y_mes(fur: date, hoy: date) -> tuple[int, int]:
    """Semana de gestación (1-based) y mes de gestación según la tabla de semanas."""
    semana = (hoy - fur).days // 7 + 1
    mes = 1
    for i, inicio in enumerate(GEST_START_WK):
        if semana >= inicio:
            mes = i + 1
    return semana, mes


def trimestre(semana: int) -> int:
    return 1 if semana <= 13 else 2 if semana <= 27 else 3


def fecha_probable_parto(fur: date) -> date:
    return fur + timedelta(days=280)


def ventana(fur: date, s: Servicio) -> tuple[date, date, date]:
    """(inicio, fin, límite de recuperación) del servicio para una FUR dada."""
    inicio = fur + timedelta(days=(GEST_START_WK[s.mes_desde - 1] - 1) * 7)
    fin = fur + timedelta(days=GEST_END_WK[s.mes_hasta - 1] * 7 - 1)
    limite = fecha_probable_parto(fur) if s.recupera_hasta_parto else fin
    return inicio, fin, limite


def estado(fur: date, s: Servicio, entregado: bool, hoy: date) -> str:
    if entregado:
        return "rec"
    inicio, fin, limite = ventana(fur, s)
    if hoy < inicio:
        return "fut"
    if hoy <= fin:
        return "verde"
    return "amar" if s.recupera_hasta_parto and hoy <= limite else "rojo"


def bucket(conteo: dict[str, int]) -> str:
    """Color de la persona: rojo si tiene algún perdido, ámbar si tiene pendientes, si no al día."""
    if conteo.get("rojo"):
        return "rojo"
    if conteo.get("amar"):
        return "amar"
    return "ok"
