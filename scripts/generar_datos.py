"""Genera los datos FICTICIOS del demo: 26 gestantes en Quinua (Huamanga, Ayacucho).

Ninguna persona es real. Las coordenadas se sortean alrededor de la plaza de Quinua,
dentro de sectores inventados. Las fechas se guardan como "días de gestación hoy"
para que el demo siempre se vea vigente, sin importar el día en que se corra.

    python scripts/generar_datos.py   ->  data/quinua_gestantes.json
"""
from __future__ import annotations

import json
import math
import random
from pathlib import Path

SEED = 20261110
OUT = Path(__file__).resolve().parents[1] / "data" / "quinua_gestantes.json"

# Plaza de Quinua (aprox.) y punto de partida del agente: el puesto de salud.
PLAZA = (-13.0530, -74.1385)
INICIO = {"nombre": "Puesto de Salud Quinua", "lat": -13.0524, "lon": -74.1392}

# Sectores inventados: (nombre, desplazamiento lat, desplazamiento lon, radio en metros)
SECTORES = [
    ("Centro", 0.0000, 0.0000, 180),
    ("Barrio Alto", 0.0032, -0.0016, 220),
    ("Barrio Bajo", -0.0030, 0.0012, 220),
    ("La Pampa", 0.0010, 0.0050, 260),
    ("Quebrada Verde", -0.0045, -0.0038, 260),
    ("Camino al Obelisco", 0.0052, 0.0034, 280),
]

NOMBRES = ["María", "Rosa", "Elena", "Lidia", "Yesenia", "Marleni", "Nelly", "Juana", "Sonia",
           "Flor", "Gladys", "Isabel", "Ruth", "Edith", "Dina", "Norma", "Luz", "Vilma", "Carmen",
           "Teodora", "Patricia", "Julia", "Fabiola", "Marisol", "Zulema", "Dora", "Maribel", "Yanet"]
APELLIDOS = ["Quispe", "Huamán", "Ccasani", "Mendoza", "Ccente", "Flores", "Sinchi", "Pillco",
             "Huaroc", "Yupanqui", "Cusi", "Gutiérrez", "Ccorahua", "Mayta", "Rojas", "Paucar",
             "Valer", "Condori", "Tello", "Cárdenas", "Ccahuana", "Mamani", "Huancahuari",
             "Palomino", "Janampa", "Llactahuamán"]


def punto(rng: random.Random, dlat: float, dlon: float, radio_m: float) -> tuple[float, float]:
    r = radio_m * math.sqrt(rng.random())
    t = rng.random() * 2 * math.pi
    lat = PLAZA[0] + dlat + (r * math.cos(t)) / 111_320
    lon = PLAZA[1] + dlon + (r * math.sin(t)) / (111_320 * math.cos(math.radians(PLAZA[0])))
    return round(lat, 6), round(lon, 6)


def main() -> None:
    rng = random.Random(SEED)
    usados: set[str] = set()
    gestantes = []
    for i in range(26):
        while True:
            nombre = f"{rng.choice(NOMBRES)} {rng.choice(APELLIDOS)} {rng.choice(APELLIDOS)}"
            if nombre not in usados:
                usados.add(nombre)
                break
        sector, dlat, dlon, radio = SECTORES[i % len(SECTORES)]
        lat, lon = punto(rng, dlat, dlon, radio)
        dias = rng.randint(35, 270)  # de la semana 6 a la 39
        ultima = rng.choice([None, 3, 6, 9, 12, 14, 15, 17, 20, 26, 33])
        if ultima is not None and ultima > dias:
            ultima = None
        gestantes.append({
            "id": f"G{i + 1:02d}",
            "nombre": nombre,
            "edad": rng.randint(16, 41),
            "dni": f"7{rng.randint(1000000, 9999999)}",
            "celular": f"9{rng.randint(10000000, 99999999)}",
            "sector": sector,
            "direccion": f"{sector}, Mz. {chr(65 + rng.randint(0, 7))} Lt. {rng.randint(1, 24)}",
            "lat": lat, "lon": lon,
            "dias_gestacion_hoy": dias,
            # Probabilidad de que haya recibido cada servicio que ya le tocaba.
            "cumplimiento": rng.choice([0.95, 0.9, 0.75, 0.6, 0.4]),
            "ultima_visita_hace_dias": ultima,
            "agua_desague": rng.random() < 0.8,
            "programa_social": rng.choice(["Juntos", "Vaso de Leche", "Ninguno", "Juntos", "Ninguno"]),
            "no_consume_suplemento_ultima_visita": rng.random() < 0.25,
            "alerta_reportada": None,
        })

    # Dos alertas reportadas por la familia, para que la ruta las priorice.
    gestantes[4]["alerta_reportada"] = {"signos": ["hinchazon", "vision_cefalea"],
                                        "fuente": "La pareja avisó por WhatsApp", "hace_horas": 3}
    gestantes[17]["alerta_reportada"] = {"signos": ["bebe_no_se_mueve"],
                                         "fuente": "La suegra llamó al agente", "hace_horas": 5}
    for idx in (4, 17):
        gestantes[idx]["dias_gestacion_hoy"] = max(gestantes[idx]["dias_gestacion_hoy"], 215)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "_nota": "Datos 100 % ficticios para demo. Ninguna persona es real.",
        "localidad": "Quinua", "distrito": "Quinua", "provincia": "Huamanga", "region": "Ayacucho",
        "inicio": INICIO, "gestantes": gestantes,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(gestantes)} gestantes -> {OUT}")


if __name__ == "__main__":
    main()
