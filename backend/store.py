"""Estado del demo en memoria: gestantes, servicios entregados y visitas registradas.

Se carga desde data/quinua_gestantes.json (datos ficticios). Todo vive en memoria y se
reinicia con /api/demo/reiniciar o al reiniciar el servidor: es una versión Lite de demo.
"""
from __future__ import annotations

import json
import random
import threading
from datetime import date, datetime, timedelta
from pathlib import Path

from . import rules
from .ficha3 import PLAN_PARTO

DATA = Path(__file__).resolve().parents[1] / "data" / "quinua_gestantes.json"
_lock = threading.Lock()


class Store:
    def __init__(self, hoy: date | None = None):
        self.hoy = hoy or date.today()
        self.reiniciar()

    def reiniciar(self) -> None:
        raw = json.loads(DATA.read_text(encoding="utf-8"))
        self.meta = {k: raw[k] for k in ("localidad", "distrito", "provincia", "region")}
        self.inicio = raw["inicio"]
        self.gestantes: dict[str, dict] = {}
        self.derivaciones: list[dict] = []
        for g in raw["gestantes"]:
            g = dict(g)
            g["fur"] = self.hoy - timedelta(days=g["dias_gestacion_hoy"])
            rng = random.Random(f"{g['id']}-servicios")
            entregados = {}
            for s in rules.SERVICIOS:
                inicio, fin, _ = rules.ventana(g["fur"], s)
                if self.hoy < inicio:
                    continue
                prob = g["cumplimiento"] * (0.55 if self.hoy <= fin else 1.0)
                if rng.random() < prob:
                    entregados[s.id] = min(fin, self.hoy).isoformat()
            g["entregados"] = entregados
            # Plan de parto: completo si el servicio figura como entregado; si no, a medio llenar.
            todos = list(PLAN_PARTO)
            g["plan_parto"] = todos if "plan" in entregados else [k for k in todos if rng.random() < 0.45]
            g["visitas"] = []
            if g["ultima_visita_hace_dias"] is not None:
                g["visitas"].append({
                    "fecha": (self.hoy - timedelta(days=g["ultima_visita_hace_dias"])).isoformat(),
                    "origen": "historial", "urgente": False, "resumen": "Visita anterior registrada.",
                })
            self.gestantes[g["id"]] = g

    # ─────────────────────────────── lectura
    def servicios(self, g: dict) -> list[dict]:
        out = []
        for s in rules.SERVICIOS:
            inicio, fin, limite = rules.ventana(g["fur"], s)
            out.append({
                "id": s.id, "tipo": s.tipo, "nombre": s.nombre,
                "mes_desde": s.mes_desde, "mes_hasta": s.mes_hasta,
                "recupera": s.recupera_hasta_parto,
                "inicio": inicio.isoformat(), "fin": fin.isoformat(), "limite": limite.isoformat(),
                "estado": rules.estado(g["fur"], s, s.id in g["entregados"], self.hoy),
                "entregado_el": g["entregados"].get(s.id),
            })
        return out

    def dias_desde_visita(self, g: dict) -> int | None:
        if not g["visitas"]:
            return None
        ultima = max(date.fromisoformat(v["fecha"][:10]) for v in g["visitas"])
        return (self.hoy - ultima).days

    def resumen(self, g: dict) -> dict:
        svcs = self.servicios(g)
        conteo = {k: sum(1 for s in svcs if s["estado"] == k) for k in ("rojo", "amar", "verde", "rec", "fut")}
        semana, mes = rules.semana_y_mes(g["fur"], self.hoy)
        fpp = rules.fecha_probable_parto(g["fur"])
        # Alertas = servicios pendientes que aún se recuperan (ámbar); recordatorios = servicios en fecha (verde).
        alertas = [{"id": s["id"], "nombre": s["nombre"], "limite": s["limite"]} for s in svcs if s["estado"] == "amar"]
        recordatorios = [{"id": s["id"], "nombre": s["nombre"], "fin": s["fin"],
                          "dias_para_vencer": (date.fromisoformat(s["fin"]) - self.hoy).days}
                         for s in svcs if s["estado"] == "verde"]
        ultima = next((v for v in reversed(g["visitas"]) if v.get("origen") == "app"), None)
        return {
            "id": g["id"], "nombre": g["nombre"], "edad": g["edad"], "sector": g["sector"],
            "direccion": g["direccion"], "lat": g["lat"], "lon": g["lon"],
            "dni": g["dni"], "celular": g["celular"],
            "agua_desague": g["agua_desague"], "programa_social": g["programa_social"],
            "fur": g["fur"].isoformat(), "fpp": rules.fecha_probable_parto(g["fur"]).isoformat(),
            "semana": semana, "mes": mes, "trimestre": rules.trimestre(semana),
            "conteo": conteo, "bucket": rules.bucket(conteo),
            "dias_desde_visita": self.dias_desde_visita(g),
            "dias_al_parto": (fpp - self.hoy).days,
            "alertas": alertas, "recordatorios": recordatorios,
            "derivada_ultima_visita": bool(ultima and ultima.get("derivada")),
            "plan_parto": {"marcados": g["plan_parto"], "total": len(PLAN_PARTO)},
            "visitada_este_mes": any(v["fecha"][:7] == self.hoy.isoformat()[:7] for v in g["visitas"]),
            "no_consume_suplemento": g["no_consume_suplemento_ultima_visita"],
            "visitas": len([v for v in g["visitas"]]),
        }

    def detalle(self, gid: str) -> dict:
        g = self.gestantes[gid]
        return {**self.resumen(g), "servicios": self.servicios(g), "historial": list(reversed(g["visitas"]))}

    # ─────────────────────────────── escritura
    def registrar_entrega(self, gid: str, sid: str, fecha: str | None) -> dict:
        with _lock:
            g = self.gestantes[gid]
            if sid not in rules.SERVICIO_POR_ID:
                raise KeyError(sid)
            g["entregados"][sid] = fecha or self.hoy.isoformat()
        return self.detalle(gid)

    def deshacer_entrega(self, gid: str, sid: str) -> dict:
        with _lock:
            self.gestantes[gid]["entregados"].pop(sid, None)
        return self.detalle(gid)

    def registrar_visita(self, gid: str, visita: dict) -> dict:
        with _lock:
            g = self.gestantes[gid]
            visita = {**visita, "fecha": datetime.now().isoformat(timespec="minutes"), "origen": "app"}
            g["visitas"].append(visita)
            sup = visita.get("campos", {}).get("suplementos", {})
            if sup:
                g["no_consume_suplemento_ultima_visita"] = any(v == "no" for v in sup.values())
        return self.detalle(gid)

    def guardar_plan_parto(self, gid: str, marcados: list[str]) -> dict:
        """Guarda lo verificado del plan de parto. Completo = servicio 'Plan de parto' entregado."""
        with _lock:
            g = self.gestantes[gid]
            g["plan_parto"] = [k for k in PLAN_PARTO if k in set(marcados)]
            if len(g["plan_parto"]) == len(PLAN_PARTO):
                g["entregados"]["plan"] = self.hoy.isoformat()
            else:
                g["entregados"].pop("plan", None)
        return self.detalle(gid)

    def avisos_de_hoy(self, gid: str) -> list[dict]:
        hoy = self.hoy.isoformat()
        return [{"canal": d["canal"], "hora": d["hora"]} for d in self.derivaciones
                if d["gestante_id"] == gid and d["fecha"] == hoy]

    def registrar_aviso(self, gid: str, canal: str) -> dict:
        """Registra que la promotora avisó a la posta (whatsapp | sms | llamada)."""
        with _lock:
            self.derivaciones.append({"gestante_id": gid, "fecha": self.hoy.isoformat(),
                                      "hora": datetime.now().strftime("%H:%M"), "canal": canal})
        return {"avisos": self.avisos_de_hoy(gid)}

STORE = Store()
