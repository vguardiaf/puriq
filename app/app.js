/* Creciendo Juntos Lite: app del agente comunitario (gestantes).
   Toda la lógica de negocio (semáforo, prioridad, ruta, IA) corre en el servidor (/api). */
"use strict";

// ─────────────────────────────── utilidades
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ic = (n, c = "") => `<svg class="ic ${c}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const plural = (n, a, b) => (n === 1 ? a : b);
const initials = (n) => n.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const parseISO = (v) => { const [y, m, d] = v.slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
const fmt = (v) => parseISO(v).toLocaleDateString("es-PE", { day: "numeric", month: "short" }).replace(/\./g, "");
const fmtL = (d) => d.toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" });
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const TRIM = { 1: "I", 2: "II", 3: "III" };

async function api(path, opts = {}) {
  const r = await fetch(path, { headers: opts.body && !(opts.body instanceof FormData) ? { "Content-Type": "application/json" } : {}, ...opts });
  if (!r.ok) {
    let msg = `Error ${r.status}`;
    try { msg = (await r.json()).detail || msg; } catch (_) {}
    throw new Error(msg);
  }
  return r.json();
}

const NIVEL = {
  urgente: { t: "Urgente", i: "alert", color: "#D12F2F" },
  vencida: { t: "Visita vencida", i: "cal", color: "#B97F00" },
  toca: { t: "Le toca visita", i: "bell", color: "#2B8E4E" },
  recomendada: { t: "Recomendada", i: "info", color: "#1F4E8C" },
  al_dia: { t: "Al día", i: "check", color: "#8A92A3" },
};
const BUCKET = { rojo: ["Con perdidos", "x"], amar: ["Con pendientes", "alert"], ok: ["Al día", "check"] };
const ICON = { rojo: "x", amar: "alert", verde: "bell", rec: "check", fut: "cal" };
const pillNivel = (n) => `<span class="pill st-${n}">${ic(NIVEL[n].i)}${NIVEL[n].t}</span>`;

// ─────────────────────────────── estado
const S = {
  view: "inicio", pid: null, filtro: "all", q: "", jornada: 240,
  meta: null, lista: null, ruta: null, cat: null, det: null,
  v: null, // visita en curso
};

function nuevaVisita(pid) {
  return { pid, fase: "inicio", texto: "", campos: null, fuente: null, resumen: "", res: null, compromiso: "", seg: 0, error: "" };
}

// ─────────────────────────────── vistas
function vInicio() {
  const L = S.lista || [];
  const d = S.meta?.hoy ? parseISO(S.meta.hoy) : new Date();
  const h = new Date().getHours();
  const hola = h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
  const nombreAg = (S.meta?.agente || "").split(" ")[0];
  const alertas = L.filter((g) => g.prioridad.nivel === "urgente");
  const cuenta = { rojo: 0, amar: 0, ok: 0 };
  L.forEach((g) => cuenta[g.bucket]++);
  const vencidas = L.filter((g) => g.prioridad.nivel === "vencida").length;
  const tocan = L.filter((g) => g.prioridad.nivel === "toca").length;
  const R = S.ruta?.totales;
  const seg = ["rojo", "amar", "ok"].map((k) => (cuenta[k] ? `<i class="st-${k}" style="flex:${cuenta[k]}"></i>` : "")).join("");
  return `
  <header class="greet"><h2>${hola}, ${esc(nombreAg)}</h2><p>${esc(cap(fmtL(d)))} · ${esc(S.meta?.localidad || "")}, ${esc(S.meta?.region || "")}</p></header>
  ${alertas.length ? `<section class="card" aria-labelledby="h-al"><div class="sec-head"><h2 id="h-al">Alertas de hoy</h2><span class="muted">${alertas.length}</span></div>
    ${alertas.map((g) => `<button class="alert st-urgente" data-act="open" data-id="${g.id}">
      <span class="ai">${ic("alert")}</span><span><b>${esc(g.nombre)}</b><small>${esc(g.prioridad.razones[0] || "")}</small></span>${ic("chev")}</button>`).join("")}
  </section>` : ""}
  <button class="cta" data-act="go" data-view="ruta">
    <span class="ci">${ic("route")}</span>
    <span><b>Tu ruta de hoy</b><span>${R ? `${R.visitas} ${plural(R.visitas, "visita", "visitas")} · ${R.km} km · terminas a las ${R.fin}` : "Calculando…"}</span></span>${ic("chev", "go")}
  </button>
  <section class="card" aria-labelledby="h-g">
    <div class="sec-head"><h2 id="h-g">Gestantes</h2><span class="muted">${L.length} en tu sector</span></div>
    <div class="bar" aria-hidden="true">${seg}</div>
    <div class="tiles">
      ${[["rojo", "Perdidos", "no se recuperan"], ["amar", "Pendientes", "por recuperar"], ["ok", "Al día", "todo en orden"]].map(([k, t, s]) =>
        `<button class="tile st-${k}${cuenta[k] ? "" : " zero"}" data-act="list" data-f="${k}" aria-label="${t}: ${cuenta[k]} gestantes">
          <span class="ti">${ic(BUCKET[k][1])}</span><span class="tn">${cuenta[k]}</span><span class="tl">${t}<small>${s}</small></span></button>`).join("")}
    </div>
    <div class="chips">
      <button class="fchip st-vencida" data-act="list" data-f="vencida" aria-pressed="false">${ic("cal")}${vencidas} con visita vencida</button>
      <button class="fchip st-toca" data-act="list" data-f="toca" aria-pressed="false">${ic("bell")}${tocan} les toca visita</button>
    </div>
  </section>
  <section class="card" aria-label="Qué significan los colores">
    <h3>Qué significan los colores</h3>
    <div class="lg st-rojo"><span class="dot">${ic("x")}</span><div><b>Perdido</b>Pasó su fecha y ya no se puede recuperar.</div></div>
    <div class="lg st-amar"><span class="dot">${ic("alert")}</span><div><b>Pendiente</b>Pasó su fecha, pero todavía se puede hacer.</div></div>
    <div class="lg st-verde"><span class="dot">${ic("bell")}</span><div><b>Servicio próximo</b>Está en su fecha y aún no se entrega.</div></div>
    <button class="link" data-act="go" data-view="ayuda">${ic("info")}Cómo se calcula la ruta y los colores</button>
  </section>
  <p class="foot">Versión Lite · datos ficticios para demostración</p>`;
}

function vRuta() {
  const R = S.ruta;
  if (!R) return `<div class="empty">Calculando la ruta…</div>`;
  const T = R.totales;
  const opts = [180, 240, 300, 360].map((m) => `<button data-act="jornada" data-min="${m}" aria-pressed="${S.jornada === m}">${m / 60} h</button>`).join("");
  const paradas = R.paradas.map((p) => `
    <li class="stop st-${p.nivel}">
      <span class="num" aria-hidden="true">${p.n}</span>
      <div class="box">
        <div class="when"><span>${ic("cal")} Llega ${p.llegada}</span><span>${p.camino_min} min a pie · ${p.camino_m} m</span></div>
        <span class="nm">${p.n}. ${esc(p.nombre)}</span>
        <span class="mt">Semana ${p.semana} · ${esc(p.direccion)}</span>
        <div class="cc">${pillNivel(p.nivel)}</div>
        <ul>${p.razones.slice(0, 3).map((r) => `<li>${esc(r)}</li>`).join("")}</ul>
        <div class="acts">
          <button class="sec" data-act="visita" data-id="${p.id}">${ic("mic")}Iniciar visita</button>
          <button class="sec" data-act="open" data-id="${p.id}">Ver ficha</button>
        </div>
      </div>
    </li>`).join("");
  return `
  <section class="card" aria-labelledby="h-r">
    <div class="sec-head"><h2 id="h-r">Ruta de hoy</h2><span class="muted">Sale ${R.hora_inicio} del ${esc(R.inicio.nombre)}</span></div>
    <div><span class="muted" id="lj">Tiempo disponible</span><div class="seg" role="group" aria-labelledby="lj">${opts}</div></div>
    <div class="stats">
      <div class="stat"><b>${T.visitas}</b><span>${plural(T.visitas, "visita", "visitas")}</span></div>
      <div class="stat"><b>${T.km}</b><span>km a pie</span></div>
      <div class="stat"><b>${T.fin}</b><span>terminas</span></div>
    </div>
    ${T.ahorro_pct > 0 ? `<p class="save">${ic("check")}Caminas ${T.ahorro_pct} % menos que visitando en el orden de la lista (${T.km_sin_optimizar} km).</p>` : ""}
    <div id="map" role="img" aria-label="Mapa de Quinua con las casas de las gestantes y la ruta numerada"></div>
    <p class="muted">Primero las urgentes; luego las que suman más prioridad por minuto de camino. Cada visita cuenta 25 min (la norma pide al menos 20).</p>
  </section>
  ${R.paradas.length ? `<ol class="stops" aria-label="Paradas en orden">${paradas}</ol>` : `<div class="empty">No hay visitas pendientes para hoy.</div>`}
  ${R.fuera.length ? `<details class="card"><summary class="link">No entran hoy (${R.fuera.length}): quedan para mañana</summary>
    <ul class="list">${R.fuera.map((f) => `<li><button class="row st-${f.nivel}" data-act="open" data-id="${f.id}"><span class="av">${initials(f.nombre)}</span>
      <span><span class="nm">${esc(f.nombre)}</span><span class="cc">${pillNivel(f.nivel)}</span></span>${ic("chev")}</button></li>`).join("")}</ul></details>` : ""}`;
}

function vGestantes() {
  const L = (S.lista || []).slice();
  const f = S.filtro;
  const q = S.q.trim().toLowerCase();
  const pasa = (g) =>
    (f === "all" || g.bucket === f || g.prioridad.nivel === f) &&
    (!q || g.nombre.toLowerCase().includes(q) || g.sector.toLowerCase().includes(q));
  const rows = L.filter(pasa).sort((a, b) => b.prioridad.puntaje - a.prioridad.puntaje);
  const chip = (k, t, st) => `<button class="fchip ${st ? "st-" + st : ""}" data-act="filtro" data-f="${k}" aria-pressed="${f === k}">${t}</button>`;
  return `
  <label class="sr" for="q">Buscar gestante</label>
  <input id="q" class="search" type="search" placeholder="Buscar por nombre o sector" value="${esc(S.q)}" autocomplete="off">
  <div class="chips" role="group" aria-label="Filtrar">
    ${chip("all", "Todas")}${chip("urgente", "Urgentes", "urgente")}${chip("vencida", "Visita vencida", "vencida")}${chip("rojo", "Con perdidos", "rojo")}${chip("amar", "Con pendientes", "amar")}
  </div>
  <p class="muted" aria-live="polite">${rows.length} ${plural(rows.length, "gestante", "gestantes")} · ordenadas por prioridad</p>
  ${rows.length ? `<ul class="list">${rows.map((g) => {
    const c = g.conteo;
    const vis = g.dias_desde_visita == null ? "sin visitas" : `última visita hace ${g.dias_desde_visita} ${plural(g.dias_desde_visita, "día", "días")}`;
    return `<li><button class="row st-${g.bucket}" data-act="open" data-id="${g.id}">
      <span class="av">${initials(g.nombre)}</span>
      <span><span class="nm">${esc(g.nombre)}</span><span class="mt">Semana ${g.semana} · ${esc(g.sector)} · ${vis}</span>
      <span class="cc">${g.prioridad.nivel !== "al_dia" ? pillNivel(g.prioridad.nivel) : ""}
        ${[["rojo", "x"], ["amar", "alert"], ["verde", "bell"]].filter(([k]) => c[k]).map(([k, i]) => `<span class="pill st-${k}">${ic(i)}${c[k]}</span>`).join("")}</span></span>
      ${ic("chev")}</button></li>`;
  }).join("")}</ul>` : `<div class="empty">No hay gestantes con este filtro.</div>`}`;
}

function svcLinea(s) {
  if (s.estado === "rec") return `Entregado${s.entregado_el ? " · " + fmt(s.entregado_el) : ""}`;
  if (s.estado === "fut") return `Le toca del ${fmt(s.inicio)} al ${fmt(s.fin)}`;
  if (s.estado === "verde") return `En fecha · hasta el ${fmt(s.fin)}`;
  if (s.estado === "amar") return `Venció el ${fmt(s.fin)} · se puede hacer hasta el parto`;
  return `Venció el ${fmt(s.fin)} · ya no se recupera`;
}

function vFicha() {
  const g = S.det;
  if (!g) return `<div class="empty">Cargando…</div>`;
  const by = (k) => g.servicios.filter((s) => s.estado === k);
  const G = [["rojo", "Perdidos", "Ya no se pueden recuperar", true], ["amar", "Pendientes", "Aún se pueden hacer: toque para registrar", true],
    ["verde", "Servicios próximos", "En su fecha: toque para registrar", true], ["fut", "Más adelante", "Todavía no corresponde", false], ["rec", "Entregados", "Ya se brindaron", false]];
  const grupos = G.map(([k, t, sub, open]) => {
    const l = by(k);
    if (!l.length) return "";
    const head = `<span class="dot">${ic(ICON[k])}</span><span>${t}<span class="gsub">${sub}</span></span><span class="cnt">${l.length}</span>`;
    const body = `<ul class="svcs">${l.map((s) => {
      const inner = `<span class="si">${ic(ICON[k])}</span><span><span class="sn">${esc(s.nombre)}</span><span class="sl">${svcLinea(s)}</span></span><span class="ptag">${s.mes_desde === s.mes_hasta ? "Mes " + s.mes_desde : `Meses ${s.mes_desde}-${s.mes_hasta}`}</span>`;
      return k === "amar" || k === "verde"
        ? `<li><button class="svc" data-act="entregar" data-sid="${s.id}" aria-label="Registrar entrega: ${esc(s.nombre)}">${inner}</button></li>`
        : `<li class="svc${k === "rec" || k === "fut" ? " plain" : ""}">${inner}</li>`;
    }).join("")}</ul>`;
    return open ? `<section class="grp st-${k}"><div class="gh">${head}</div>${body}</section>` : `<details class="grp st-${k}"><summary>${head}</summary>${body}</details>`;
  }).join("");
  const al = g.alerta;
  const hist = g.historial.length
    ? `<ul class="hist">${g.historial.map((v) => `<li class="${v.urgente ? "st-urgente" : "st-rec"}"><b>${fmt(v.fecha)}</b> · ${v.origen === "app" ? "Ficha 3 grabada" : "Visita"}${v.urgente ? " · <b>referida al EESS</b>" : ""}<br><span class="muted">${esc(v.resumen || (v.mensajes || []).join(", "))}</span></li>`).join("")}</ul>`
    : `<p class="muted">Todavía no tiene visitas registradas.</p>`;
  return `
  <section class="hero st-${g.bucket}">
    <div class="id"><span class="av">${initials(g.nombre)}</span><div><h2>${esc(g.nombre)}</h2>
      <span class="mt">Gestante · ${g.edad} años · ${esc(g.sector)}</span></div></div>
    <dl class="facts">
      <div><dt>SEMANA</dt><dd>${g.semana} · Trim. ${TRIM[g.trimestre]}</dd></div>
      <div><dt>PARTO PROBABLE</dt><dd>${fmt(g.fpp)}</dd></div>
      <div><dt>ÚLTIMA VISITA</dt><dd>${g.dias_desde_visita == null ? "Ninguna" : `Hace ${g.dias_desde_visita} d`}</dd></div>
      <div><dt>CELULAR</dt><dd><a href="tel:${esc(g.celular)}">${esc(g.celular)}</a></dd></div>
      <div><dt>DIRECCIÓN</dt><dd>${esc(g.direccion)}</dd></div>
      <div><dt>PROGRAMA SOCIAL</dt><dd>${esc(g.programa_social)}</dd></div>
    </dl>
  </section>
  ${al ? `<div class="banner st-urgente" role="alert">${ic("alert")}<div><b>Alerta reportada hace ${al.hace_horas} h</b>${esc(g.prioridad.razones[0])}</div></div>` : ""}
  <button class="big" data-act="visita" data-id="${g.id}">${ic("mic")}Visita domiciliaria · Ficha 3</button>
  ${g.prioridad.razones.length ? `<section class="card st-${g.prioridad.nivel}"><div class="sec-head"><h2>Por qué visitarla</h2>${pillNivel(g.prioridad.nivel)}</div>
    <ul>${g.prioridad.razones.map((r) => `<li>${esc(r)}</li>`).join("")}</ul></section>` : ""}
  ${grupos}
  <section class="card"><h2>Visitas</h2>${hist}</section>`;
}

// ─────────────────────────────── Ficha 3 (visita)
const V_LBL = { si: "Sí", no: "No", nm: "No se habló" };
function triHTML(grupo, k, label, val, ev, alarm) {
  return `<div class="q"><span class="ql" id="l-${grupo}-${k}">${esc(label)}</span>
    <div class="tri${alarm ? " alarm" : ""}" role="group" aria-labelledby="l-${grupo}-${k}">
      ${["si", "no", "nm"].map((o) => `<button type="button" class="${o}" data-act="campo" data-g="${grupo}" data-k="${k}" data-v="${o}" aria-pressed="${val === o}">${V_LBL[o]}</button>`).join("")}
    </div>${ev ? `<span class="ev">“${esc(ev)}”</span>` : ""}</div>`;
}

function vVisita() {
  const g = S.det, v = S.v, cat = S.cat;
  if (!g || !v || !cat) return `<div class="empty">Cargando…</div>`;
  const hoy = new Date().toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" });
  const datos = `<section class="card slim st-${g.bucket}" aria-label="Datos de la ficha">
    <div class="id"><span class="av">${initials(g.nombre)}</span><div><b>${esc(g.nombre)}</b>
      <span class="mt">Ficha 3 · Visita N.° ${g.historial.length + 1} · ${hoy}</span>
      <span class="mt">DNI ${esc(g.dni)} · Semana ${g.semana} (trim. ${TRIM[g.trimestre]}) · Agente: ${esc(S.meta?.agente.split(" (")[0] || "")}</span></div></div>
  </section>`;

  if (v.fase === "inicio") {
    return `${datos}
    <section class="card rec" aria-labelledby="h-rec">
      <h2 id="h-rec">Grabar visita</h2>
      <button class="recbtn" data-act="grabar" aria-label="Empezar a grabar la visita">${ic("mic")}</button>
      <p class="muted">Pida permiso a la gestante antes de grabar. Converse con normalidad: la app llena <b>suplementos, por qué no los toma, signos de alarma y hábitos</b>.</p>
      ${v.error ? `<p class="banner st-urgente" role="alert">${ic("alert")}<span>${esc(v.error)}</span></p>` : ""}
      <button class="sec" data-act="ejemplo">${ic("play")}Usar audio de ejemplo (demo)</button>
      <button class="ghost" data-act="manual">Llenar sin grabar</button>
    </section>`;
  }
  if (v.fase === "grabando") {
    const mm = String(Math.floor(v.seg / 60)).padStart(2, "0"), ss = String(v.seg % 60).padStart(2, "0");
    return `${datos}
    <section class="card rec" aria-live="polite">
      <h2>Grabando…</h2>
      <button class="recbtn on" data-act="parar" aria-label="Terminar la grabación y procesar">${ic("stop")}</button>
      <span class="timer" id="timer">${mm}:${ss}</span>
      <div class="level" aria-hidden="true"><i id="lvl"></i></div>
      <p class="muted">Recuerde preguntar por los suplementos, los signos de alarma y la alimentación.</p>
      <button class="ghost" data-act="cancelar">Cancelar</button>
    </section>`;
  }
  if (v.fase === "procesando") {
    const st = (k, t) => `<li class="${v.paso > k ? "ok" : v.paso === k ? "on" : ""}">${v.paso > k ? ic("check") : v.paso === k ? `<span class="spin" aria-hidden="true"></span>` : ic("cal")}${t}</li>`;
    return `${datos}<section class="card" aria-live="polite"><h2>Procesando la visita</h2>
      <ol class="steps">${st(1, "Pasando la voz a texto (Whisper)")}${st(2, "Llenando la Ficha 3 con IA")}</ol>
      <p class="muted">El audio se procesa en el servidor de la app y no se guarda.</p></section>`;
  }
  const c = v.campos;
  const algunoNo = Object.values(c.suplementos).some((x) => x.valor === "no");
  const fuente = v.fuente === "ia" ? `<span class="pill st-ia">${ic("sprout")}Llenado con IA · revise cada respuesta</span>`
    : v.fuente === "reglas" ? `<span class="pill st-amar">${ic("info")}Llenado por palabras clave · revise cada respuesta</span>` : "";
  const ficha = `
    <section class="card">
      <div class="sec-head"><h2>Lo que se registró</h2></div>
      <div class="cc">${fuente}</div>
      ${v.texto ? `<details><summary class="link">${ic("doc")}Ver o corregir la transcripción</summary>
        <label class="sr" for="tx">Transcripción</label><textarea id="tx">${esc(v.texto)}</textarea>
        <button class="sec" data-act="rellenar">${ic("sprout")}Volver a llenar con este texto</button></details>` : ""}
    </section>
    <section class="card" aria-labelledby="h-c9"><h2 id="h-c9">9. Consumo de suplementos</h2>
      ${Object.entries(cat.suplementos).map(([k, l], i) => triHTML("suplementos", k, l, c.suplementos[k].valor, c.suplementos[k].evidencia, false).replace('class="q"', i ? 'class="q"' : 'class="q first"')).join("")}
    </section>
    ${algunoNo ? `<section class="card" aria-labelledby="h-c10"><h2 id="h-c10">10. ¿Por qué no lo consume?</h2>
      <div class="checks">${Object.entries(cat.motivos).map(([k, l]) => `<label><input type="checkbox" data-motivo="${k}" ${c.motivos.includes(k) ? "checked" : ""}>${esc(l)}</label>`).join("")}</div></section>` : ""}
    <section class="card" aria-labelledby="h-c11"><h2 id="h-c11">11. Signos de alarma</h2><p class="muted">Si hay alguno, la gestante debe ir hoy al establecimiento de salud.</p>
      ${Object.entries(cat.signos).map(([k, l]) => triHTML("signos", k, l, c.signos[k].valor, c.signos[k].evidencia, true)).join("")}
    </section>
    <section class="card" aria-labelledby="h-c12"><h2 id="h-c12">12-13. Hábitos saludables</h2>
      ${Object.entries(cat.habitos).map(([k, l], i) => triHTML("habitos", k, l, c.habitos[k].valor, c.habitos[k].evidencia, false).replace('class="q"', i ? 'class="q"' : 'class="q first"')).join("")}
    </section>`;
  if (v.fase === "ficha") {
    return `${datos}${ficha}<button class="big" data-act="mensajes">${ic("msg")}Generar mensajes para la gestante</button>`;
  }
  // fase "mensajes"
  const R = v.res;
  if (!R) return `${datos}<section class="card" aria-live="polite"><ol class="steps"><li class="on"><span class="spin"></span>Preparando los mensajes…</li></ol></section>`;
  const sit = R.mensajes.filter((m) => m.origen === "situacion"), tri = R.mensajes.filter((m) => m.origen === "trimestre");
  const msg = (m) => `<article class="msg${m.origen === "situacion" ? " sit" : ""}"><div class="mh"><h3>${esc(m.titulo)}</h3></div><p class="say">${esc(m.decir)}</p></article>`;
  return `${datos}
    ${R.urgente ? `<div class="banner st-urgente" role="alert">${ic("hosp")}<div><b>Referir HOY al establecimiento de salud</b>
      <ul>${R.referencias.map((r) => `<li>${esc(r)}</li>`).join("")}</ul></div></div>`
      : R.referencias.length ? `<div class="banner st-amar">${ic("hosp")}<div><b>Motivos de referencia al EESS</b><ul>${R.referencias.map((r) => `<li>${esc(r)}</li>`).join("")}</ul></div></div>` : ""}
    <section class="card" aria-labelledby="h-m"><div class="sec-head"><h2 id="h-m">Qué decirle hoy</h2>${R.fuente === "ia" ? `<span class="pill st-ia">${ic("sprout")}Redactado con IA</span>` : ""}</div>
      ${sit.length ? `<h3>Por lo que encontraste en la visita</h3>${sit.map(msg).join("")}` : ""}
      ${tri.length ? `<h3>Por estar en el ${TRIM[R.trimestre]} trimestre (semana ${R.semana})</h3>${tri.map(msg).join("")}` : ""}
    </section>
    <section class="card"><h2>Compromiso</h2><p class="muted">Pregúntele: “${esc(R.cierre)}”</p>
      <div class="field"><label for="comp">QUÉ SE COMPROMETE A HACER</label><textarea id="comp" placeholder="Ej.: Tomar el hierro con jugo de naranja después del almuerzo e ir hoy al puesto de salud.">${esc(v.compromiso)}</textarea></div>
    </section>
    <button class="big teal" data-act="guardar">${ic("check")}Guardar visita</button>
    <button class="ghost" data-act="volver-ficha">Volver a la Ficha 3</button>`;
}

function vAyuda() {
  return `
  <section class="card"><h2>Cómo se arma tu ruta</h2>
    <ul>
      <li><b>Urgentes primero:</b> alertas que avisó la familia o signos de alarma en la última visita.</li>
      <li><b>Visita vencida:</b> la norma pide 2 visitas al mes, cada 13 a 15 días. Pasados los 15 días sube la prioridad.</li>
      <li><b>Servicios pendientes o en fecha</b> (controles, exámenes, hierro), <b>no toma suplementos</b>, <b>cerca del parto</b> o <b>gestante adolescente</b> suman puntos.</li>
      <li>Luego la app elige a quién visitar según los <b>puntos por minuto de camino</b> y ordena las casas para caminar menos (2-opt), dentro del tiempo que tienes.</li>
    </ul></section>
  <section class="card"><h2>Qué graba la Ficha 3</h2>
    <p>Del Formato N.° 03 (RM 241-2024-MINSA), la versión Lite llena la parte C: <b>9</b> consumo de suplementos, <b>10</b> por qué no los consume, <b>11</b> signos de alarma y <b>12-13</b> hábitos saludables.</p>
    <p>Con eso y el trimestre, la app elige los <b>mensajes de orientación</b> (parte D) y los <b>motivos de referencia</b> al EESS. Los mensajes se eligen con reglas; la IA solo los redacta en palabras sencillas.</p></section>
  <section class="card"><h2>Privacidad</h2>
    <ul><li>El audio se transcribe en el servidor de la app (Whisper) y no se guarda.</li>
    <li>Pida siempre permiso a la gestante antes de grabar.</li>
    <li>Este demo usa solo <b>datos ficticios</b>: ninguna persona es real.</li></ul></section>
  <section class="card"><h2>Versión Lite</h2>
    <p>Incluye gestantes, ruta, mapa y Ficha 3 con voz para un agente. La versión completa suma niñas y niños (CRED), modo sin conexión, panel del establecimiento (PROMSA) e integración con HIS.</p>
    <button class="sec" data-act="reiniciar">Reiniciar datos del demo</button></section>
  <p class="foot">Creciendo Juntos Lite · ${esc(S.meta?.ia ? "IA: " + S.meta.modelo_ia : "IA sin configurar: se usan reglas")} · Whisper ${esc(S.meta?.whisper || "")}</p>`;
}

// ─────────────────────────────── render y navegación
const main = $("#main"), topEl = $("#top"), nav = $("#nav");
let mapa = null, lastView = null;

function render() {
  const v = S.view;
  const titulo = { ficha: S.det?.nombre || "Gestante", visita: "Visita domiciliaria", ayuda: "Ayuda" }[v];
  topEl.innerHTML = titulo && v !== "ayuda"
    ? `<button class="back" data-act="back">${ic("back")}Volver</button><h1>${esc(titulo)}</h1>`
    : `<span class="brand"><span class="logo">${ic("sprout")}</span>Creciendo Juntos <span class="lite">LITE</span></span><span class="tag-mock">Datos ficticios</span>`;
  main.innerHTML = { inicio: vInicio, ruta: vRuta, gestantes: vGestantes, ficha: vFicha, visita: vVisita, ayuda: vAyuda }[v]();
  const cur = v === "ficha" || v === "visita" ? "gestantes" : v;
  nav.innerHTML = [["inicio", "home", "Inicio"], ["ruta", "route", "Ruta"], ["gestantes", "users", "Gestantes"], ["ayuda", "info", "Ayuda"]]
    .map(([k, i, l]) => `<button data-act="go" data-view="${k}"${cur === k ? ' aria-current="page"' : ""}>${ic(i)}${l}</button>`).join("");
  if (v === "ruta") dibujarMapa();
  if (lastView !== v) { window.scrollTo(0, 0); lastView = v; }
}

function dibujarMapa() {
  const el = $("#map");
  if (!el || !S.ruta || typeof L === "undefined") return;
  if (mapa) { mapa.remove(); mapa = null; }
  mapa = L.map(el, { scrollWheelZoom: false, zoomControl: true });
  const R = S.ruta;
  // La vista se fija antes de agregar capas (Leaflet necesita un centro para dibujar líneas).
  const pts = [[R.inicio.lat, R.inicio.lon], ...R.paradas.map((p) => [p.lat, p.lon])];
  mapa.fitBounds(pts.length > 1 ? pts : R.geo.casas.features.map((f) => [f.geometry.coordinates[1], f.geometry.coordinates[0]]), { padding: [28, 28] });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(mapa);
  L.geoJSON(R.geo.ruta, { style: { color: "#1F4E8C", weight: 4, dashArray: "8 8", opacity: 0.85 } }).addTo(mapa);
  R.geo.casas.features.forEach((f) => {
    const p = f.properties, [lon, lat] = f.geometry.coordinates, col = NIVEL[p.nivel].color;
    const pop = `<b>${esc(p.nombre)}</b><br>${NIVEL[p.nivel].t}${p.orden ? ` · parada ${p.orden}` : ""}`;
    if (p.orden) {
      L.marker([lat, lon], { icon: L.divIcon({ className: "", html: `<span class="mk" style="background:${col}">${p.orden}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] }), title: p.nombre, zIndexOffset: 500 })
        .addTo(mapa).bindPopup(pop);
    } else {
      L.circleMarker([lat, lon], { radius: 6, color: "#fff", weight: 2, fillColor: col, fillOpacity: 0.9 }).addTo(mapa).bindPopup(pop);
    }
  });
  L.marker([R.inicio.lat, R.inicio.lon], { icon: L.divIcon({ className: "", html: `<span class="mk start">${ic("hosp")}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] }), title: R.inicio.nombre })
    .addTo(mapa).bindPopup(`<b>${esc(R.inicio.nombre)}</b><br>Punto de partida`);
}

async function cargarLista() {
  [S.lista, S.ruta] = await Promise.all([api("/api/gestantes"), api(`/api/ruta?jornada=${S.jornada}`)]);
}

async function go(view, opts = {}) {
  Object.assign(S, opts);
  const hash = view === "ficha" || view === "visita" ? `${view}/${S.pid}` : view;
  if (location.hash.slice(1) !== hash) { location.hash = hash; return; } // hashchange llama a route()
  await route();
}

async function route() {
  const [v, id] = location.hash.slice(1).split("/");
  S.view = ["inicio", "ruta", "gestantes", "ficha", "visita", "ayuda"].includes(v) ? v : "inicio";
  if ((S.view === "ficha" || S.view === "visita") && id) {
    if (S.pid !== id || !S.det) { S.pid = id; S.det = null; render(); }
    try { S.det = await api(`/api/gestantes/${id}`); } catch (e) { toast(e.message); S.view = "gestantes"; }
    if (S.view === "visita" && (!S.v || S.v.pid !== id)) S.v = nuevaVisita(id);
  } else if (S.view === "ficha" || S.view === "visita") S.view = "gestantes";
  render();
  main.focus({ preventScroll: true });
}

// ─────────────────────────────── grabación y procesamiento de la visita
let rec = null;
async function grabar() {
  const v = S.v;
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    v.error = "Este navegador no permite grabar. Use “Usar audio de ejemplo” o “Llenar sin grabar”.";
    return render();
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const tipo = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((t) => MediaRecorder.isTypeSupported(t)) || "";
    const mr = new MediaRecorder(stream, tipo ? { mimeType: tipo } : undefined);
    const partes = [];
    mr.ondataavailable = (e) => e.data.size && partes.push(e.data);
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const an = ctx.createAnalyser(); an.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(an);
    const buf = new Uint8Array(an.fftSize);
    let raf;
    const nivel = () => {
      an.getByteTimeDomainData(buf);
      let m = 0; for (const x of buf) m = Math.max(m, Math.abs(x - 128));
      const el = $("#lvl"); if (el) el.style.width = Math.min(100, (m / 64) * 100) + "%";
      raf = requestAnimationFrame(nivel);
    };
    const t0 = Date.now();
    const tick = setInterval(() => { v.seg = Math.round((Date.now() - t0) / 1000); const el = $("#timer"); if (el) el.textContent = `${String(Math.floor(v.seg / 60)).padStart(2, "0")}:${String(v.seg % 60).padStart(2, "0")}`; }, 500);
    rec = { mr, partes, stream, ctx, stop: () => { clearInterval(tick); cancelAnimationFrame(raf); stream.getTracks().forEach((t) => t.stop()); ctx.close(); }, tipo };
    mr.start(1000);
    v.fase = "grabando"; v.seg = 0; v.error = "";
    render(); nivel();
  } catch (e) {
    v.error = "No se pudo usar el micrófono. Revise el permiso del navegador.";
    render();
  }
}

function pararGrabacion(procesar) {
  if (!rec) return;
  const { mr, partes, stop, tipo } = rec;
  mr.onstop = () => { stop(); if (procesar) procesarAudio(new Blob(partes, { type: tipo || "audio/webm" })); };
  mr.stop(); rec = null;
  if (!procesar) { S.v.fase = "inicio"; render(); }
}

async function procesarAudio(blob) {
  const v = S.v;
  v.fase = "procesando"; v.paso = 1; render();
  try {
    const fd = new FormData();
    fd.append("audio", blob, blob.type.includes("wav") ? "visita.wav" : "visita.webm");
    const t = await api("/api/visita/transcribir", { method: "POST", body: fd });
    if (!t.texto || t.texto.length < 10) throw new Error("No se entendió el audio. Intente grabar más cerca.");
    v.texto = t.texto; v.duracion = t.duracion_audio_s;
    await llenar();
  } catch (e) {
    v.fase = "inicio"; v.error = e.message; render();
  }
}

async function llenar() {
  const v = S.v;
  v.fase = "procesando"; v.paso = 2; render();
  try {
    const d = await api("/api/visita/extraer", { method: "POST", body: JSON.stringify({ gestante_id: v.pid, texto: v.texto }) });
    v.campos = { suplementos: d.suplementos, motivos: d.motivos || [], signos: d.signos, habitos: d.habitos };
    v.fuente = d.fuente; v.resumen = d.resumen || "";
    v.fase = "ficha"; render();
  } catch (e) { v.fase = "inicio"; v.error = e.message; render(); }
}

function camposVacios() {
  const vacio = (o) => Object.fromEntries(Object.keys(o).map((k) => [k, { valor: "nm", evidencia: "" }]));
  return { suplementos: vacio(S.cat.suplementos), motivos: [], signos: vacio(S.cat.signos), habitos: vacio(S.cat.habitos) };
}

function soloValores(c) {
  const f = (o) => Object.fromEntries(Object.entries(o).map(([k, x]) => [k, x.valor]));
  return { suplementos: f(c.suplementos), motivos: c.motivos, signos: f(c.signos), habitos: f(c.habitos) };
}

async function generarMensajes() {
  const v = S.v;
  v.fase = "mensajes"; v.res = null; render();
  try {
    v.res = await api("/api/visita/mensajes", { method: "POST", body: JSON.stringify({ gestante_id: v.pid, campos: soloValores(v.campos), transcripcion: v.texto }) });
  } catch (e) { v.fase = "ficha"; toast(e.message); }
  render();
}

async function guardarVisita() {
  const v = S.v, R = v.res;
  v.compromiso = $("#comp")?.value || "";
  try {
    S.det = await api("/api/visita/guardar", { method: "POST", body: JSON.stringify({
      gestante_id: v.pid, campos: soloValores(v.campos), urgente: R.urgente, referencias: R.referencias,
      mensajes: R.mensajes, compromiso: v.compromiso,
      resumen: (v.fuente === "ia" && v.resumen) || R.referencias.join(" · ") || "Visita realizada sin hallazgos.",
      duracion_s: v.duracion ? Math.round(v.duracion) : v.seg || null }) });
    S.v = null;
    await cargarLista();
    toast(R.urgente ? "Visita guardada · referida al EESS" : "Visita guardada");
    go("ficha", { pid: S.det.id });
  } catch (e) { toast(e.message); }
}

// ─────────────────────────────── eventos
let UNDO = null, TT = null;
function toast(msg, undo) {
  const t = $("#toast"); UNDO = undo || null;
  t.innerHTML = `${ic("check")}<span>${esc(msg)}</span>${undo ? `<button data-act="undo">Deshacer</button>` : ""}`;
  t.hidden = false; clearTimeout(TT); TT = setTimeout(() => { t.hidden = true; UNDO = null; }, 6000);
}

document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const a = b.dataset.act, v = S.v;
  if (a === "go") go(b.dataset.view);
  else if (a === "back") history.length > 1 ? history.back() : go("inicio");
  else if (a === "open") go("ficha", { pid: b.dataset.id });
  else if (a === "visita") { if (!S.v || S.v.pid !== b.dataset.id) S.v = nuevaVisita(b.dataset.id); go("visita", { pid: b.dataset.id }); }
  else if (a === "list") { S.filtro = b.dataset.f; go("gestantes"); }
  else if (a === "filtro") { S.filtro = b.dataset.f; render(); }
  else if (a === "jornada") { S.jornada = Number(b.dataset.min); S.ruta = await api(`/api/ruta?jornada=${S.jornada}`); render(); }
  else if (a === "entregar") {
    const sid = b.dataset.sid, gid = S.det.id;
    S.det = await api(`/api/gestantes/${gid}/servicios/${sid}`, { method: "POST", body: JSON.stringify({}) });
    render(); cargarLista();
    toast("Servicio registrado como entregado", async () => { S.det = await api(`/api/gestantes/${gid}/servicios/${sid}`, { method: "DELETE" }); render(); cargarLista(); });
  }
  else if (a === "undo") { $("#toast").hidden = true; if (UNDO) UNDO(); }
  else if (a === "grabar") grabar();
  else if (a === "parar") pararGrabacion(true);
  else if (a === "cancelar") pararGrabacion(false);
  else if (a === "ejemplo") {
    try {
      const ej = await api("/api/demo/ejemplo");
      if (ej.audio) procesarAudio(await (await fetch(ej.audio)).blob());
      else { v.texto = ej.texto; llenar(); }
    } catch (err) { v.error = err.message; render(); }
  }
  else if (a === "manual") { v.campos = camposVacios(); v.fuente = null; v.fase = "ficha"; render(); }
  else if (a === "rellenar") { v.texto = $("#tx").value; llenar(); }
  else if (a === "campo") { v.campos[b.dataset.g][b.dataset.k].valor = b.dataset.v; render(); }
  else if (a === "mensajes") generarMensajes();
  else if (a === "volver-ficha") { v.fase = "ficha"; render(); }
  else if (a === "guardar") guardarVisita();
  else if (a === "reiniciar") { await api("/api/demo/reiniciar", { method: "POST" }); S.v = null; await cargarLista(); toast("Datos del demo reiniciados"); go("inicio"); }
});
document.addEventListener("change", (e) => {
  const m = e.target.dataset?.motivo;
  if (m && S.v?.campos) {
    const l = S.v.campos.motivos;
    S.v.campos.motivos = e.target.checked ? [...new Set([...l, m])] : l.filter((x) => x !== m);
  }
});
document.addEventListener("input", (e) => {
  if (e.target.id === "q") { S.q = e.target.value; const pos = e.target.selectionStart; render(); const q = $("#q"); q.focus(); q.setSelectionRange(pos, pos); }
  if (e.target.id === "comp" && S.v) S.v.compromiso = e.target.value;
});
window.addEventListener("hashchange", route);

(async function init() {
  try {
    [S.meta, S.cat] = await Promise.all([api("/api/estado"), api("/api/ficha3/catalogo")]);
    await cargarLista();
  } catch (e) {
    main.innerHTML = `<div class="empty">No se pudo conectar con el servidor. ${esc(e.message)}</div>`;
    return;
  }
  route();
})();
