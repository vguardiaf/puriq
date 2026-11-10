"""Ficha 3 (Formato N.° 03, RM 241-2024-MINSA): Ficha de Visita Domiciliaria para la Gestante.

Esta versión Lite graba solo la parte C de la ficha:
  9-10  consumo de suplementos y por qué no los consume
  11    signos de alarma
  12-13 hábitos saludables
Con esos datos y el trimestre se eligen los mensajes de orientación (parte D) y los motivos
de referencia al establecimiento de salud. La SELECCIÓN de mensajes es por reglas (segura y
auditable); la IA solo los redacta en lenguaje sencillo para esta gestante.

Valor de cada campo: "si" | "no" | "nm" (no mencionado en la visita).
"""
from __future__ import annotations

SUPLEMENTOS = {
    "af_fe": "Tabletas de ácido fólico y hierro",
    "fe": "Tabletas de hierro",
    "calcio": "Tabletas de calcio",
}
MOTIVOS_NO_CONSUMO = {
    "tragar": "Le es difícil tragar",
    "estrenimiento": "Le da estreñimiento o malestar de estómago",
    "se_acabo": "Se le acabó el suplemento",
    "no_le_dieron": "No le dieron en sus controles",
    "nauseas": "No le gusta o le da náuseas",
    "sabor": "Olor o sabor desagradable",
}
SIGNOS_ALARMA = {
    "vision_cefalea": "Visión borrosa o dolor de cabeza frecuente",
    "bebe_no_se_mueve": "El bebé no se mueve",
    "perdida_liquido": "Pérdida de líquido",
    "hinchazon": "Hinchazón de pies, manos o cara",
    "sangrado": "Sangrado vaginal",
    "dolor_contracciones": "Dolor o contracciones antes de tiempo",
}
HABITOS = {
    "frutas_verduras": "Come frutas y verduras",
    "cepillado": "Se cepilla los dientes 2 veces al día",
    "lavado_manos": "Se lava las manos con agua y jabón",
    "carnes": "Come carnes (pollo, res, pescado)",
    "sangrecita": "Come sangrecita, hígado o bazo",
}

# ─────────────────────────────── mensajes de orientación (parte D) por trimestre
MENSAJES = {
    "cpn": ("Importancia del control prenatal",
            "Ir a todos sus controles permite ver que usted y su bebé estén bien y detectar problemas a tiempo."),
    "plan_parto": ("Plan de parto",
                   "Decidir desde ahora dónde dará a luz, quién la acompañará, cómo llegará al establecimiento y guardar dinero para el transporte."),
    "fe": ("Suplementación con hierro",
           "Tomar una tableta de hierro al día evita la anemia. Mejor con jugo de naranja o limonada, y no con té, café ni leche."),
    "af": ("Ácido fólico",
           "El ácido fólico protege la columna y el cerebro del bebé. Tómelo todos los días."),
    "signos": ("Signos de alarma",
               "Si tiene dolor de cabeza fuerte, ve borroso, se le hinchan los pies o la cara, sangra, pierde líquido o el bebé no se mueve, vaya de inmediato al establecimiento."),
    "lavado": ("Lavado de manos",
               "Lavarse las manos con agua y jabón antes de comer y después de ir al baño evita infecciones."),
    "alimentacion": ("Alimentación durante la gestación",
                     "Coma tres comidas y dos refrigerios al día, con frutas, verduras y alimentos de origen animal como sangrecita, hígado, huevo o pescado."),
    "parto_inst": ("Parto institucional",
                   "Dar a luz en el establecimiento de salud es lo más seguro para usted y su bebé."),
    "lactancia": ("Apego y lactancia materna",
                  "Poner al bebé en su pecho apenas nazca y darle solo leche materna hasta los 6 meses."),
    "puerperio": ("Signos de peligro después del parto",
                  "Después del parto, si tiene fiebre, sangrado abundante o mal olor, vaya de inmediato al establecimiento."),
    "cepillado": ("Salud bucal",
                  "Cepíllese los dientes al menos dos veces al día; durante el embarazo las encías se inflaman más."),
}
POR_TRIMESTRE = {
    1: ["cpn", "af", "signos", "lavado"],
    2: ["cpn", "plan_parto", "fe", "signos", "lavado"],
    3: ["fe", "alimentacion", "plan_parto", "parto_inst", "lactancia", "puerperio"],
}

# ─────────────────────────────── consejos por situación encontrada en la visita
CONSEJO_MOTIVO = {
    "tragar": "Puede tomarla con un poco de jugo y comer algo antes. Si aun así no puede, pida otra presentación en el establecimiento.",
    "estrenimiento": "Tome más agua y coma frutas y verduras. Si el malestar sigue, coméntelo en su control.",
    "se_acabo": "Acérquese al establecimiento a recoger más tabletas; no debe dejar de tomarlas.",
    "no_le_dieron": "Pida sus tabletas en su próximo control; son gratuitas.",
    "nauseas": "Tómela después de comer o antes de dormir, con jugo de naranja o limonada.",
    "sabor": "Tómela con jugo de fruta cítrica para disimular el sabor.",
}
MENSAJE_POR_HABITO = {
    "frutas_verduras": "alimentacion",
    "carnes": "alimentacion",
    "sangrecita": "alimentacion",
    "lavado_manos": "lavado",
    "cepillado": "cepillado",
}


def seleccionar_mensajes(campos: dict, trimestre: int, pendientes_control: bool) -> dict:
    """Devuelve {urgente, referencias, mensajes} a partir de lo registrado en la visita.

    campos = {"suplementos": {id: si|no|nm}, "motivos": [ids], "signos": {id: si|no|nm},
              "habitos": {id: si|no|nm}}
    """
    sup = campos.get("suplementos", {})
    signos = campos.get("signos", {})
    habitos = campos.get("habitos", {})
    motivos = [m for m in campos.get("motivos", []) if m in MOTIVOS_NO_CONSUMO]

    signos_si = [k for k, v in signos.items() if v == "si" and k in SIGNOS_ALARMA]
    no_toma = [k for k, v in sup.items() if v == "no" and k in SUPLEMENTOS]

    referencias = []
    if signos_si:
        referencias.append("Presenta signos de alarma: " + "; ".join(SIGNOS_ALARMA[s].lower() for s in signos_si))
    if no_toma:
        sin = any(m in ("se_acabo", "no_le_dieron") for m in motivos)
        referencias.append(("No cuenta con suplementos" if sin else "No consume suplementos")
                           + " (" + "; ".join(SUPLEMENTOS[s].lower() for s in no_toma) + ")")
    if pendientes_control:
        referencias.append("No tiene o no acudió a sus controles")

    mensajes: list[dict] = []
    vistos: set[str] = set()

    def add(mid: str, origen: str, extra: str | None = None) -> None:
        if mid in vistos:
            return
        vistos.add(mid)
        titulo, texto = MENSAJES[mid]
        mensajes.append({"id": mid, "titulo": titulo, "texto": f"{texto} {extra}" if extra else texto,
                         "origen": origen})

    # 1) lo encontrado en la visita va primero: es lo más relevante para esta gestante
    if signos_si:
        add("signos", "situacion")
    if no_toma:
        add("fe", "situacion", " ".join(CONSEJO_MOTIVO[m] for m in motivos) or None)
    for h, v in habitos.items():
        if v == "no" and h in MENSAJE_POR_HABITO:
            add(MENSAJE_POR_HABITO[h], "situacion")
    # 2) lo que toca por trimestre
    for mid in POR_TRIMESTRE.get(trimestre, []):
        add(mid, "trimestre")

    return {"urgente": bool(signos_si), "signos_alarma": [SIGNOS_ALARMA[s] for s in signos_si],
            "referencias": referencias, "mensajes": mensajes}


def texto_derivacion(r: dict, signos: list[str], agente: str, celular_agente: str, eess: str, hora: str) -> str:
    """Mensaje de WhatsApp que recibe el establecimiento cuando la visita detecta signos de alarma."""
    return "\n".join([
        "*Derivación de gestante con signos de alarma* · Puriq",
        f"Para: {eess}",
        "",
        f"Gestante: {r['nombre']} · DNI {r['dni']} · {r['edad']} años",
        f"Semana {r['semana']} de gestación · parto probable {r['fpp'][8:10]}/{r['fpp'][5:7]}/{r['fpp'][:4]}",
        f"Dirección: {r['direccion']} · Cel. {r['celular']}",
        "Signos de alarma detectados en la visita domiciliaria:",
        *[f"• {s}" for s in signos],
        "",
        f"Detectado por: {agente} (agente comunitaria) · Cel. {celular_agente} · {hora}",
        "Se indicó a la gestante acudir hoy al establecimiento. Por favor, confirmar la atención.",
    ])


def catalogo() -> dict:
    """Catálogo que el frontend usa para dibujar la ficha."""
    return {"suplementos": SUPLEMENTOS, "motivos": MOTIVOS_NO_CONSUMO,
            "signos": SIGNOS_ALARMA, "habitos": HABITOS}
