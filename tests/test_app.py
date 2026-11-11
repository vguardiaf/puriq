import os
from datetime import date, timedelta

os.environ["WHISPER_PRELOAD"] = "0"
os.environ["LIMITE_POR_MIN"] = "1000"
os.environ.pop("ANTHROPIC_API_KEY", None)  # las pruebas usan el respaldo por reglas

from fastapi.testclient import TestClient

from backend import ficha3, rules
from backend.main import app
from backend.routing import planificar, prioridad
from backend.store import STORE

HOY = date(2026, 11, 10)
client = TestClient(app)


# ─────────────────────────────── semáforo
def test_semana_mes_y_trimestre():
    fur = HOY - timedelta(days=7 * 20)  # semana 21
    semana, mes = rules.semana_y_mes(fur, HOY)
    assert semana == 21 and mes == 5 and rules.trimestre(semana) == 2


def test_estados_del_servicio():
    cpn1, orina = rules.SERVICIO_POR_ID["cpn1"], rules.SERVICIO_POR_ID["orina"]
    fur = HOY - timedelta(days=7 * 20)
    assert rules.estado(fur, cpn1, False, HOY) == "rojo"   # control vencido: no se recupera
    assert rules.estado(fur, orina, False, HOY) == "amar"  # examen vencido: se recupera hasta el parto
    assert rules.estado(fur, orina, True, HOY) == "rec"    # entregado siempre prevalece
    fur_nueva = HOY - timedelta(days=10)
    assert rules.estado(fur_nueva, rules.SERVICIO_POR_ID["cpn2"], False, HOY) == "fut"
    assert rules.estado(fur_nueva, cpn1, False, HOY) == "verde"


# ─────────────────────────────── mensajes de la Ficha 3
def test_signos_de_alarma_generan_referencia_urgente():
    campos = {"suplementos": {"fe": "no"}, "motivos": ["nauseas"], "signos": {"hinchazon": "si", "sangrado": "no"},
              "habitos": {"sangrecita": "no"}}
    r = ficha3.seleccionar_mensajes(campos, trimestre=3, pendientes_control=False)
    assert r["urgente"] is True
    assert any("signos de alarma" in x.lower() for x in r["referencias"])
    assert any("suplementos" in x.lower() for x in r["referencias"])
    assert r["mensajes"][0]["id"] == "signos" and r["mensajes"][0]["origen"] == "situacion"
    fe = next(m for m in r["mensajes"] if m["id"] == "fe")
    assert "después de comer" in fe["texto"]  # consejo por náuseas
    ids = [m["id"] for m in r["mensajes"]]
    assert len(ids) == len(set(ids))  # sin duplicados
    assert "parto_inst" in ids  # mensaje del III trimestre


def test_sin_hallazgos_solo_mensajes_del_trimestre():
    r = ficha3.seleccionar_mensajes({"suplementos": {"fe": "si"}, "signos": {}, "habitos": {}}, 1, False)
    assert not r["urgente"] and not r["referencias"]
    assert all(m["origen"] == "trimestre" for m in r["mensajes"])


# ─────────────────────────────── ruta
def _resumenes():
    return [STORE.resumen(g) for g in STORE.gestantes.values()]


def test_ruta_prioriza_alertas_de_servicio_y_cabe_en_la_jornada():
    rs = _resumenes()
    p = planificar(rs, STORE.inicio, jornada_min=240)
    top = max(rs, key=lambda r: prioridad(r).puntaje)
    assert top["id"] in {x["id"] for x in p["paradas"]}
    assert any(x["nivel"] == "alerta" for x in p["paradas"])
    assert p["totales"]["min_total"] <= 240
    assert p["totales"]["km"] <= p["totales"]["km_sin_optimizar"] + 1e-6


def test_mas_tiempo_permite_mas_visitas():
    corta = planificar(_resumenes(), STORE.inicio, jornada_min=180)["totales"]["visitas"]
    larga = planificar(_resumenes(), STORE.inicio, jornada_min=360)["totales"]["visitas"]
    assert larga >= corta


def test_alertas_son_de_servicios():
    base = {"dias_desde_visita": 3, "conteo": {}, "semana": 20, "trimestre": 2, "edad": 25, "dias_al_parto": 140,
            "recordatorios": []}
    con_alerta = {**base, "alertas": [{"id": "vih", "nombre": "Examen de VIH", "limite": "2027-03-01"}]}
    assert prioridad(con_alerta).nivel == "alerta"
    assert prioridad({**base, "alertas": []}).nivel == "al_dia"
    assert prioridad({**base, "alertas": [], "derivada_ultima_visita": True}).nivel == "seguimiento"


# ─────────────────────────────── API de punta a punta (sin audio)
def test_flujo_visita_por_api():
    STORE.reiniciar()
    g = client.get("/api/gestantes").json()
    assert len(g) == 26
    gid = next(x["id"] for x in g if x["alertas"])
    texto = open("data/visita_ejemplo.txt", encoding="utf-8").read()
    campos = client.post("/api/visita/extraer", json={"gestante_id": gid, "texto": texto}).json()
    assert campos["signos"]["hinchazon"]["valor"] == "si"
    valores = {k: {kk: vv["valor"] for kk, vv in campos[k].items()} for k in ("suplementos", "signos", "habitos")}
    valores["motivos"] = campos["motivos"]
    m = client.post("/api/visita/mensajes", json={"gestante_id": gid, "campos": valores, "transcripcion": texto}).json()
    assert m["urgente"] and m["mensajes"]
    # Signos de alarma -> la promotora avisa desde su celular: WhatsApp, SMS o llamada
    der = m["derivacion"]
    assert der["whatsapp"].startswith("https://wa.me/") and der["sms"].startswith("sms:+") and der["tel"].startswith("tel:+")
    assert "DNI" not in der["texto"] and len(der["texto"]) <= 320 and "hinchazón" in der["texto"].lower()
    assert der["avisos"] == []
    av = client.post("/api/visita/aviso", json={"gestante_id": gid, "canal": "sms"}).json()
    assert [a["canal"] for a in av["avisos"]] == ["sms"]
    assert client.post("/api/visita/aviso", json={"gestante_id": gid, "canal": "paloma"}).status_code == 422
    d = client.post("/api/visita/guardar", json={"gestante_id": gid, "campos": valores, "urgente": True,
                                                 "referencias": m["referencias"], "mensajes": m["mensajes"]}).json()
    assert d["dias_desde_visita"] == 0 and d["derivada_ultima_visita"] and d["prioridad"]["nivel"] in ("alerta", "seguimiento")
    STORE.reiniciar()


def test_entrega_y_deshacer():
    STORE.reiniciar()
    g = client.get("/api/gestantes").json()
    gid = g[0]["id"]
    det = client.get(f"/api/gestantes/{gid}").json()
    sid = next((s["id"] for s in det["servicios"] if s["estado"] in ("amar", "verde")), None)
    if sid:
        assert next(s for s in client.post(f"/api/gestantes/{gid}/servicios/{sid}", json={}).json()["servicios"]
                    if s["id"] == sid)["estado"] == "rec"
        assert next(s for s in client.delete(f"/api/gestantes/{gid}/servicios/{sid}").json()["servicios"]
                    if s["id"] == sid)["estado"] != "rec"


def test_errores_claros():
    assert client.get("/api/gestantes/NOEXISTE").status_code == 404
    assert client.get("/api/ruta?jornada=5").status_code == 422


def test_plan_de_parto_solo_iii_trimestre_y_completo_es_recibido():
    STORE.reiniciar()
    g = client.get("/api/gestantes").json()
    t3 = next(x for x in g if x["trimestre"] == 3)
    t2 = next(x for x in g if x["trimestre"] == 2)
    assert client.post(f"/api/gestantes/{t2['id']}/plan-parto", json={"marcados": []}).status_code == 422
    todos = list(ficha3.PLAN_PARTO)
    d = client.post(f"/api/gestantes/{t3['id']}/plan-parto", json={"marcados": todos}).json()
    assert next(s for s in d["servicios"] if s["id"] == "plan")["estado"] == "rec"
    d = client.post(f"/api/gestantes/{t3['id']}/plan-parto", json={"marcados": todos[:3]}).json()
    assert next(s for s in d["servicios"] if s["id"] == "plan")["estado"] != "rec"
    STORE.reiniciar()


def test_grupos_de_gestantes_cuadran():
    g = client.get("/api/gestantes").json()
    con_alertas = [x for x in g if x["bucket"] == "amar"]
    assert len(con_alertas) == sum(1 for x in g if x["alertas"])
    assert sum(1 for x in g if x["bucket"] in ("amar", "verde", "ok")) == len(g)


# ─────────────────────────────── seguridad clínica: detección de signos de alarma sin IA
CASOS_SIGNOS = [
    ("Me duele mucho la cabeza.", "vision_cefalea", "si"), ("A ratos veo borroso.", "vision_cefalea", "si"),
    ("No tengo dolor de cabeza.", "vision_cefalea", "no"), ("No sé, me duele la cabeza.", "vision_cefalea", "si"),
    ("Tengo los pies hinchados.", "hinchazon", "si"), ("Se me hincha la cara en las mañanas.", "hinchazon", "si"),
    ("No estoy hinchada.", "hinchazon", "no"), ("El bebé no se mueve desde ayer.", "bebe_no_se_mueve", "si"),
    ("Casi no siento que se mueva mi bebé.", "bebe_no_se_mueve", "si"), ("Ayer sangré un poquito.", "sangrado", "si"),
    ("Estoy manchando.", "sangrado", "si"), ("No he sangrado nada.", "sangrado", "no"),
    ("Sangrecita nunca he comido.", "sangrado", "nm"), ("Me salió agüita por abajo.", "perdida_liquido", "si"),
    ("Se me rompió la fuente.", "perdida_liquido", "si"), ("Tengo contracciones.", "dolor_contracciones", "si"),
    ("Me duele la barriga muy fuerte.", "dolor_contracciones", "si"), ("Umayqa nanawanmi.", "vision_cefalea", "si"),
    ("Chakiykuna punkisqa.", "hinchazon", "si"),
]


def test_respaldo_detecta_signos_de_alarma():
    from ai.visita import _respaldo_extraer
    fallos = [(f, k, e) for f, k, e in CASOS_SIGNOS if _respaldo_extraer(f)["signos"][k]["valor"] != e]
    assert not fallos, fallos


def test_limite_de_solicitudes():
    import backend.main as m
    m._llamadas.clear()
    antes = m.LIMITE_POR_MIN
    m.LIMITE_POR_MIN = 3
    try:
        cods = [client.post("/api/visita/extraer", json={"gestante_id": "G19", "texto": "me duele la cabeza"}).status_code
                for _ in range(5)]
        assert cods[:3] == [200, 200, 200] and cods[3] == 429
    finally:
        m.LIMITE_POR_MIN = antes
        m._llamadas.clear()
