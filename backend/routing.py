"""Ruta de visitas del día: prioriza por alertas de servicios y optimiza distancia y tiempo.

El agente comunitario no brinda servicios: hace seguimiento. Por eso las alertas son de
SERVICIOS (controles, exámenes, suplementos pendientes) y de la propia visita (vencida según
la norma). Los signos de alarma no se programan: se detectan en la visita y se derivan al EESS.

1. Puntaje de prioridad por gestante, con sus razones (para que el agente entienda el porqué).
2. Matriz de distancias con GeoPandas: los puntos se proyectan a UTM 18S (EPSG:32718) para
   medir en metros; se aplica un factor de desvío por calles y cuestas.
3. Selección y orden (problema tipo "orienteering"): se insertan las gestantes por
   puntaje / minutos extra hasta llenar la jornada, y el orden se mejora con 2-opt.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timedelta

import geopandas as gpd
from shapely.geometry import LineString, Point

CRS_METROS = "EPSG:32718"  # UTM zona 18S: Ayacucho
DESVIO = 1.3               # las calles no son línea recta y Quinua tiene cuestas
VELOCIDAD_M_MIN = 60.0     # caminando, ~3.6 km/h
MIN_VISITA = 20            # la norma pide visitas de al menos 20 minutos
MIN_MARGEN = 5             # saludo, ubicar la casa, registrar


@dataclass
class Prioridad:
    puntaje: float
    nivel: str          # alerta | seguimiento | vencida | toca | recomendada | al_dia
    razones: list[str]


NIVELES = ("alerta", "seguimiento", "vencida", "toca")


def _dm(iso: str) -> str:
    return f"{int(iso[8:10])}/{int(iso[5:7])}"


def prioridad(r: dict) -> Prioridad:
    """r = resumen de la gestante (Store.resumen)."""
    p, razones, niveles = 0.0, [], set()
    # Alertas de servicio: pendientes (vencidos) que aún se recuperan hasta el parto.
    alertas = r.get("alertas", [])
    if alertas:
        p += 25 * len(alertas)
        n = len(alertas)
        razones.append(f"{n} servicio{'s' if n > 1 else ''} pendiente{'s' if n > 1 else ''}")
        if r.get("dias_al_parto", 999) <= 30:
            p += 15
            razones.append(f"Parto en {r['dias_al_parto']} días")
        niveles.add("alerta")
    # Recordatorios: servicios en fecha; suben si están por vencer.
    recs = r.get("recordatorios", [])
    if recs:
        p += 5 * len(recs)
        pronto = [x for x in recs if x["dias_para_vencer"] <= 7]
        if pronto:
            p += 10 * len(pronto)
            k = len(pronto)
            razones.append(f"{k} servicio{'s' if k > 1 else ''} vence{'n' if k > 1 else ''} esta semana")
    # Seguimiento de una derivación hecha en la visita anterior.
    if r.get("derivada_ultima_visita"):
        p += 40
        razones.append("¿Fue a la posta?")
        niveles.add("seguimiento")
    d = r.get("dias_desde_visita")
    if d is None:
        p += 45
        razones.append("Sin visitas")
        niveles.add("vencida")
    elif d > 15:
        p += 40 + min(d - 15, 15)
        razones.append(f"Visita vencida ({d} días)")
        niveles.add("vencida")
    elif d >= 13:
        p += 30
        razones.append(f"Le toca visita ({d} días)")
        niveles.add("toca")
    elif d >= 10:
        p += 8
    if r.get("no_consume_suplemento"):
        p += 12
        razones.append("No toma suplementos")
    if r["semana"] >= 37:
        p += 15
        razones.append("Parto cerca")
    elif r["trimestre"] == 3:
        p += 8
    if r["edad"] < 18:
        p += 8
        razones.append("Adolescente")
    nivel = next((n for n in NIVELES if n in niveles), "recomendada" if p >= 15 else "al_dia")
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
    """Mejora un camino abierto; los primeros `fijo` nodos (el punto de partida) no se mueven."""
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

    # Inserción por puntaje / minutos extra, mientras quepa en la jornada (sale del puesto de salud).
    orden, fijo = [0], 1
    puntaje = {idx[r["id"]]: prios[r["id"]].puntaje for r in cand}
    pend = [idx[r["id"]] for r in cand]
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
            "lat": r["lat"], "lon": r["lon"], "semana": r["semana"], "mes": r["mes"], "bucket": r["bucket"],
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
