"""Ruta de visitas del día: prioriza por urgencia y optimiza distancia y tiempo.

1. Puntaje de prioridad por gestante, con sus razones (para que el agente entienda el porqué).
2. Matriz de distancias con GeoPandas: los puntos se proyectan a UTM 18S (EPSG:32718) para
   medir en metros; se aplica un factor de desvío por calles y cuestas.
3. Selección y orden (problema tipo "orienteering"): las urgentes van primero, por cercanía;
   luego se insertan las demás por puntaje / minutos extra hasta llenar la jornada, y el
   orden se mejora con 2-opt.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timedelta

import geopandas as gpd
from shapely.geometry import LineString, Point

from .ficha3 import SIGNOS_ALARMA

CRS_METROS = "EPSG:32718"  # UTM zona 18S: Ayacucho
DESVIO = 1.3               # las calles no son línea recta y Quinua tiene cuestas
VELOCIDAD_M_MIN = 60.0     # caminando, ~3.6 km/h
MIN_VISITA = 20            # la norma pide visitas de al menos 20 minutos
MIN_MARGEN = 5             # saludo, ubicar la casa, registrar


@dataclass
class Prioridad:
    puntaje: float
    nivel: str          # urgente | vencida | toca | recomendada | al_dia
    razones: list[str]


def prioridad(r: dict) -> Prioridad:
    """r = resumen de la gestante (Store.resumen)."""
    p, razones, nivel = 0.0, [], "al_dia"
    alerta = r.get("alerta")
    if alerta:
        p += 100
        signos = ", ".join(SIGNOS_ALARMA.get(s, s).lower() for s in alerta["signos"])
        razones.append(f"Alerta: {signos}. {alerta['fuente']}")
        nivel = "urgente"
    if r.get("urgente_ultima_visita"):
        p += 60
        razones.append("Tuvo signos de alarma en la última visita: hacer seguimiento")
        nivel = "urgente"
    d = r.get("dias_desde_visita")
    if d is None:
        p += 45
        razones.append("Todavía no recibe ninguna visita")
        nivel = nivel if nivel == "urgente" else "vencida"
    elif d > 15:
        p += 40 + min(d - 15, 15)
        razones.append(f"Visita vencida: la última fue hace {d} días (la norma pide cada 13 a 15)")
        nivel = nivel if nivel == "urgente" else "vencida"
    elif d >= 13:
        p += 30
        razones.append(f"Le toca visita: la última fue hace {d} días")
        nivel = nivel if nivel in ("urgente", "vencida") else "toca"
    elif d >= 10:
        p += 8
    c = r["conteo"]
    if c.get("amar"):
        p += 8 * c["amar"]
        razones.append(f"{c['amar']} servicio(s) pendiente(s) que aún se pueden recuperar")
    if c.get("verde"):
        p += 5 * c["verde"]
        razones.append(f"{c['verde']} servicio(s) en fecha: recordárselos")
    if r.get("no_consume_suplemento"):
        p += 12
        razones.append("No estaba tomando sus suplementos")
    if r["semana"] >= 37:
        p += 15
        razones.append(f"Semana {r['semana']}: el parto está cerca")
    elif r["trimestre"] == 3:
        p += 8
    if r["edad"] < 18:
        p += 8
        razones.append("Gestante adolescente")
    if nivel == "al_dia" and p >= 15:
        nivel = "recomendada"
    return Prioridad(round(p, 1), nivel, razones)


def _matrices(puntos: list[tuple[float, float]]) -> tuple[list[list[float]], list[list[float]]]:
    """Metros y minutos caminando entre todos los pares de puntos (lat, lon)."""
    gdf = gpd.GeoDataFrame(geometry=[Point(lon, lat) for lat, lon in puntos], crs="EPSG:4326").to_crs(CRS_METROS)
    geoms = list(gdf.geometry)
    metros = [[a.distance(b) * DESVIO for b in geoms] for a in geoms]
    minutos = [[m / VELOCIDAD_M_MIN for m in fila] for fila in metros]
    return metros, minutos


def _costo(orden: list[int], M: list[list[float]]) -> float:
    return sum(M[a][b] for a, b in zip(orden, orden[1:]))


def _two_opt(orden: list[int], M: list[list[float]], fijo: int) -> list[int]:
    """Mejora un camino abierto; los primeros `fijo` nodos (inicio + urgentes) no se mueven."""
    mejor = orden[:]
    mejoro = True
    while mejoro:
        mejoro = False
        for i in range(max(fijo, 1), len(mejor) - 1):
            for j in range(i + 1, len(mejor)):
                nuevo = mejor[:i] + mejor[i:j + 1][::-1] + mejor[j + 1:]
                if _costo(nuevo, M) + 1e-9 < _costo(mejor, M):
                    mejor, mejoro = nuevo, True
    return mejor


def planificar(resumenes: list[dict], inicio: dict, jornada_min: int = 240, hora_inicio: str = "08:00") -> dict:
    prios = {r["id"]: prioridad(r) for r in resumenes}
    cand = [r for r in resumenes if prios[r["id"]].nivel != "al_dia"]
    puntos = [(inicio["lat"], inicio["lon"])] + [(r["lat"], r["lon"]) for r in cand]
    metros, M = _matrices(puntos)
    idx = {r["id"]: i + 1 for i, r in enumerate(cand)}
    visita = MIN_VISITA + MIN_MARGEN

    def tiempo(orden: list[int]) -> float:
        return _costo(orden, M) + visita * (len(orden) - 1)

    # 1) las urgentes primero, por cercanía
    orden = [0]
    urg = [idx[r["id"]] for r in cand if prios[r["id"]].nivel == "urgente"]
    while urg:
        sig = min(urg, key=lambda k: M[orden[-1]][k])
        if tiempo(orden + [sig]) > jornada_min and len(orden) > 1:
            break
        orden.append(sig)
        urg.remove(sig)
    fijo = len(orden)

    # 2) inserción por puntaje / minutos extra, mientras quepa en la jornada
    puntaje = {idx[r["id"]]: prios[r["id"]].puntaje for r in cand}
    pend = [idx[r["id"]] for r in cand if idx[r["id"]] not in orden and prios[r["id"]].nivel != "urgente"]
    while pend:
        mejor = None
        base = tiempo(orden)
        for k in pend:
            for pos in range(fijo, len(orden) + 1):
                prueba = orden[:pos] + [k] + orden[pos:]
                t = tiempo(prueba)
                if t > jornada_min:
                    continue
                valor = puntaje[k] / max(t - base, 1)
                if mejor is None or valor > mejor[0]:
                    mejor = (valor, k, prueba)
        if mejor is None:
            break
        orden = mejor[2]
        pend.remove(mejor[1])
    orden = _two_opt(orden, M, fijo)

    # 3) paradas con hora estimada de llegada
    h, m = map(int, hora_inicio.split(":"))
    reloj = datetime(2000, 1, 1, h, m)
    por_idx = {v: k for k, v in idx.items()}
    res_por_id = {r["id"]: r for r in cand}
    paradas, total_m = [], 0.0
    for n, (a, b) in enumerate(zip(orden, orden[1:]), start=1):
        reloj += timedelta(minutes=M[a][b])
        total_m += metros[a][b]
        r = res_por_id[por_idx[b]]
        pr = prios[r["id"]]
        paradas.append({
            "n": n, "id": r["id"], "nombre": r["nombre"], "sector": r["sector"], "direccion": r["direccion"],
            "lat": r["lat"], "lon": r["lon"], "semana": r["semana"], "bucket": r["bucket"],
            "nivel": pr.nivel, "puntaje": pr.puntaje, "razones": pr.razones,
            "llegada": reloj.strftime("%H:%M"), "camino_min": round(M[a][b]), "camino_m": round(metros[a][b]),
        })
        reloj += timedelta(minutes=visita)
    elegidos = set(orden[1:])
    fuera = sorted(
        ({"id": r["id"], "nombre": r["nombre"], "nivel": prios[r["id"]].nivel,
          "puntaje": prios[r["id"]].puntaje, "razones": prios[r["id"]].razones}
         for r in cand if idx[r["id"]] not in elegidos),
        key=lambda x: -x["puntaje"])

    # Comparación: las mismas casas visitadas en el orden de la lista (alfabético)
    ingenuo = [0] + sorted(elegidos, key=lambda k: res_por_id[por_idx[k]]["nombre"])
    km_ingenuo = _costo(ingenuo, metros) / 1000
    km = total_m / 1000

    # GeoJSON hecho con GeoPandas para el mapa: casas + línea de la ruta
    orden_por_id = {p["id"]: p["n"] for p in paradas}
    casas = gpd.GeoDataFrame(
        [{"id": r["id"], "nombre": r["nombre"], "bucket": r["bucket"], "nivel": prios[r["id"]].nivel,
          "orden": orden_por_id.get(r["id"])} for r in resumenes],
        geometry=[Point(r["lon"], r["lat"]) for r in resumenes], crs="EPSG:4326")
    coords = [(inicio["lon"], inicio["lat"])] + [(p["lon"], p["lat"]) for p in paradas]
    linea = gpd.GeoDataFrame([{"tipo": "ruta"}],
                             geometry=[LineString(coords) if len(coords) > 1 else Point(coords[0])],
                             crs="EPSG:4326")

    return {
        "inicio": inicio, "hora_inicio": hora_inicio, "jornada_min": jornada_min,
        "paradas": paradas, "fuera": fuera,
        "totales": {
            "visitas": len(paradas), "km": round(km, 2),
            "min_caminando": round(_costo(orden, M)), "min_total": round(tiempo(orden)),
            "fin": reloj.strftime("%H:%M"),
            "km_sin_optimizar": round(km_ingenuo, 2),
            "ahorro_pct": round(100 * (1 - km / km_ingenuo)) if km_ingenuo else 0,
        },
        "geo": {"casas": json.loads(casas.to_json()), "ruta": json.loads(linea.to_json())},
    }
