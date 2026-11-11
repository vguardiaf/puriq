/* Puriq Lite: app del agente comunitario (gestantes).
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

// Acceso y datos guardados en el celular (funcionan sin señal).
const AUTH_KEY = "puriq.acceso", COLA_KEY = "puriq.pendientes", MAX_FALLOS = 5, BLOQUEO_MS = 7 * 60 * 1000;
const leerLS = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (_) { return d; } };
const guardarLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
let ACC = leerLS(AUTH_KEY, null); // { token, agente: {nombre, iniciales, posta}, pin: {sal, hash}, fallos }
const ENCOLABLES = /^\/api\/(gestantes\/[^/]+\/(servicios|plan-parto)|visita\/(aviso|guardar))/;

async function api(path, opts = {}) {
  const headers = { ...(opts.body && !(opts.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
    ...(ACC?.token ? { "X-Token": ACC.token } : {}) };
  let r;
  try {
    r = await fetch(path, { ...opts, headers });
  } catch (e) {
    // Sin señal: los envíos se guardan en el celular y se mandan cuando vuelve la señal.
    if ((opts.method || "GET").toUpperCase() !== "GET" && ENCOLABLES.test(path)) { encolar(path, opts); return { _sinSenal: true }; }
    throw new Error("Sin señal. Intente de nuevo.");
  }
  if (r.status === 401 && !path.startsWith("/api/auth/")) {
    salir("Este celular fue desactivado. Pida un código a la posta.");
    throw new Error("Sin acceso");
  }
  if (!r.ok) {
    let msg = `Error ${r.status}`;
    try { msg = (await r.json()).detail || msg; } catch (_) {}
    throw new Error(msg);
  }
  return r.json();
}

function encolar(path, opts) {
  const c = leerLS(COLA_KEY, []);
  c.push({ path, method: opts.method || "POST", body: opts.body || null });
  guardarLS(COLA_KEY, c);
}

async function enviarPendientes() {
  const c = leerLS(COLA_KEY, []);
  if (!c.length || !navigator.onLine || !ACC?.token) return;
  const quedan = [];
  for (const x of c) {
    try {
      const r = await fetch(x.path, { method: x.method, body: x.body, headers: { "Content-Type": "application/json", "X-Token": ACC.token } });
      if (r.status >= 500) quedan.push(x);
    } catch (_) { quedan.push(x); }
  }
  guardarLS(COLA_KEY, quedan);
  const enviados = c.length - quedan.length;
  if (enviados) {
    toast(`Se enviaron ${enviados} ${plural(enviados, "dato guardado", "datos guardados")} sin señal`);
    try { await cargarLista(); if (S.det) S.det = await api(`/api/gestantes/${S.det.id}`); } catch (_) {}
  }
  if (!S.acceso) render();
}

function estadoSenal() {
  const n = leerLS(COLA_KEY, []).length;
  if (!navigator.onLine) return `<span class="pill st-rojo senal">${ic("x")}Sin señal${n ? ` · ${n} por enviar` : ""}</span>`;
  if (n) return `<span class="pill st-amar senal">${n} por enviar</span>`;
  return `<span class="tag-mock">Datos ficticios</span>`;
}

// Íconos estándar: un solo ícono por concepto en toda la app.
const IC = { alerta: "alert", recordatorio: "bell", perdido: "x", recibido: "check", futuro: "cal", visita: "clock", derivacion: "hosp", aldia: "check" };
const NIVEL = {
  alerta: { t: "Alerta", i: IC.alerta, color: "#EDC35F" },
  seguimiento: { t: "¿Fue a la posta?", i: IC.derivacion, color: "#5B4BC4" },
  vencida: { t: "Visita vencida", i: IC.visita, color: "#E59A90" },
  toca: { t: "Le toca visita", i: IC.visita, color: "#9BC79A" },
  recomendada: { t: "Le toca pronto", i: IC.recordatorio, color: "#9BC79A" },
  al_dia: { t: "Al día", i: IC.aldia, color: "#8A92A3" },
};
const BUCKET = { amar: ["Con alertas", IC.alerta], verde: ["Le toca pronto", IC.recordatorio], ok: ["Al día", IC.aldia] };
const ICON = { rojo: IC.perdido, amar: IC.alerta, verde: IC.recordatorio, rec: IC.recibido, fut: IC.futuro };
const COLORES = [["amar", "Alerta", "Venció, pero aún se puede hacer."], ["verde", "Le toca pronto", "Está en su fecha."],
  ["rojo", "Perdido", "Ya no se puede hacer."], ["rec", "Recibido", "Ya lo recibió."], ["fut", "Más adelante", "Todavía no le toca."]];
const CANAL = { whatsapp: "WhatsApp", sms: "SMS", llamada: "llamada" };
const pillNivel = (n) => `<span class="pill st-${n}">${ic(NIVEL[n].i)}${NIVEL[n].t}</span>`;


// ─────────────────────────────── estado
const S = {
  view: "inicio", pid: null, filtro: "all", q: "", jornada: 120,
  meta: null, lista: null, ruta: null, cat: null, det: null,
  v: null, // visita en curso
};

function nuevaVisita(pid) {
  return { pid, fase: "inicio", texto: "", campos: null, fuente: null, resumen: "", res: null, seg: 0, error: "" };
}

// ─────────────────────────────── vistas
function vInicio() {
  const L = S.lista || [];
  const d = S.meta?.hoy ? parseISO(S.meta.hoy) : new Date();
  const nombreAg = (S.meta?.agente || "").split(" ")[0];
  const grupo = { amar: [], verde: [], ok: [] };
  L.forEach((g) => grupo[g.bucket].push(g));
  const alertas = grupo.amar.slice().sort((a, b) => b.prioridad.puntaje - a.prioridad.puntaje);
  const vm = L.filter((g) => g.visitada_este_mes).length;
  const pct = L.length ? Math.round((vm / L.length) * 100) : 0;
  const R = S.ruta?.totales;
  const tile = (k) => `<button class="tile st-${k}${grupo[k].length ? "" : " zero"}" data-act="list" data-f="${k}" aria-label="${BUCKET[k][0]}: ${grupo[k].length}">
      <span class="ti">${ic(BUCKET[k][1])}</span><span class="tn">${grupo[k].length}</span><span class="tl">${BUCKET[k][0]}</span></button>`;
  return `
  <header class="greet"><h2>Hola, ${esc(nombreAg)}</h2><p>${esc(cap(fmtL(d)))} · ${esc(S.meta?.localidad || "")}</p></header>
  <button class="cta" data-act="go" data-view="ruta"><span class="ci">${ic("route")}</span>
    <span><b>Ruta de hoy</b><span>${R ? `${R.visitas} visitas · ${R.km} km · fin ${R.fin}` : "…"}</span></span>${ic("chev")}</button>
  <section class="card" aria-labelledby="h-g">
    <h2 id="h-g">Tus ${L.length} gestantes</h2>
    <div class="tiles">${tile("amar")}${tile("verde")}${tile("ok")}</div>
    <div class="meta"><div class="sec-head"><b>Este mes</b><span><b>${vm}</b> de ${L.length} visitadas</span></div>
      <div class="pbar" role="progressbar" aria-valuenow="${vm}" aria-valuemin="0" aria-valuemax="${L.length}" aria-label="Gestantes visitadas este mes"><i style="width:${pct}%"></i></div>
      <p class="muted">Te faltan ${L.length - vm}. Cada una: 2 visitas al mes.</p></div>
  </section>
  ${alertas.length ? `<section class="card" aria-labelledby="h-al">
    <div class="sec-head"><h2 id="h-al">Alertas</h2><button class="link" data-act="list" data-f="amar">Ver las ${alertas.length}</button></div>
    ${alertas.slice(0, 2).map((g) => `<button class="alert st-amar" data-act="open" data-id="${g.id}"><span class="ai">${ic(IC.alerta)}</span>
      <span><b>${esc(g.nombre)}</b><small>${g.alertas.length} ${plural(g.alertas.length, "servicio pendiente", "servicios pendientes")}</small></span>${ic("chev")}</button>`).join("")}
  </section>` : ""}`;
}

function vRuta() {
  const R = S.ruta;
  if (!R) return `<div class="empty">Calculando la ruta…</div>`;
  const T = R.totales;
  const opts = [60, 120, 180, 240].map((m) => `<button data-act="jornada" data-min="${m}" aria-pressed="${S.jornada === m}">${m / 60} h</button>`).join("");
  const paradas = R.paradas.map((p) => `
    <li class="stop st-${p.nivel}">
      <span class="num" aria-hidden="true">${p.n}</span>
      <div class="box">
        <div class="when"><span>${ic(IC.visita)} ${p.llegada}</span><span>${p.camino_min} min a pie · ${p.camino_m} m</span></div>
        <span class="nm">${p.n}. ${esc(p.nombre)}</span>
        <span class="mt">${p.mes} meses · ${esc(p.direccion)}</span>
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
    <div class="sec-head"><h2 id="h-r">Ruta de hoy</h2><span class="muted">${new Date().getHours() >= 17 ? "Mañana" : "Hoy"} desde las ${R.hora_inicio}</span></div>
    <div><span class="muted" id="lj">¿Cuánto tiempo tienes hoy?</span><div class="seg" role="group" aria-labelledby="lj">${opts}</div></div>
    <div class="stats">
      <div class="stat"><b>${T.visitas}</b><span>${plural(T.visitas, "visita", "visitas")}</span></div>
      <div class="stat"><b>${T.km}</b><span>km a pie</span></div>
      <div class="stat"><b>${T.fin}</b><span>terminas</span></div>
    </div>
    ${T.ahorro_pct > 0 ? `<p class="save">${ic("check")}Caminas ${T.ahorro_pct} % menos que visitando en el orden de la lista (${T.km_sin_optimizar} km).</p>` : ""}
    <div id="map" role="img" aria-label="Mapa de Quinua con las casas de las gestantes y la ruta numerada"></div>
  </section>
  ${R.paradas.length ? `<ol class="stops" aria-label="Paradas en orden">${paradas}</ol>` : `<div class="empty">No hay visitas pendientes para hoy.</div>`}
  ${R.fuera.length ? `<details class="card"><summary class="link">No entran hoy (${R.fuera.length})</summary>
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
  <div class="chips scroll" role="group" aria-label="Filtrar">
    ${chip("all", "Todas")}${chip("amar", "Con alertas", "amar")}${chip("verde", "Le toca pronto", "verde")}${chip("ok", "Al día", "ok")}${chip("vencida", "Visita vencida", "vencida")}
  </div>
  <p class="muted" aria-live="polite">${rows.length} ${plural(rows.length, "gestante", "gestantes")} · ordenadas por prioridad</p>
  ${rows.length ? `<ul class="list">${rows.map((g) => {
    const c = g.conteo;
    const vis = g.dias_desde_visita == null ? "sin visitas" : `visita hace ${g.dias_desde_visita} d`;
    return `<li><button class="row st-${g.bucket}" data-act="open" data-id="${g.id}">
      <span class="av">${initials(g.nombre)}</span>
      <span><span class="nm">${esc(g.nombre)}</span><span class="mt">${g.mes} meses · ${esc(g.sector)} · ${vis}</span>
      <span class="cc">${["vencida", "toca", "seguimiento"].includes(g.prioridad.nivel) ? pillNivel(g.prioridad.nivel) : ""}
        ${[["rojo", "x"], ["amar", "alert"], ["verde", "bell"]].filter(([k]) => c[k]).map(([k, i]) => `<span class="pill st-${k}">${ic(i)}${c[k]}</span>`).join("")}</span></span>
      ${ic("chev")}</button></li>`;
  }).join("")}</ul>` : `<div class="empty">No hay gestantes con este filtro.</div>`}`;
}

function vFicha() {
  const g = S.det;
  if (!g) return `<div class="empty">Cargando…</div>`;
  const by = (k) => g.servicios.filter((s) => s.estado === k && s.id !== "plan");
  const linea = (s) => (s.estado === "rec" ? `Recibido${s.entregado_el ? " " + fmt(s.entregado_el) : ""}`
    : s.estado === "fut" ? `Desde ${fmt(s.inicio)}` : s.estado === "verde" ? `Hasta ${fmt(s.fin)}`
    : s.estado === "amar" ? "Hasta el parto" : `Venció ${fmt(s.fin)}`);
  const G = [["amar", "Alertas", "Mire su tarjeta. Si ya lo tiene, toque Recibió"], ["verde", "Le toca pronto", "En su fecha"], ["rojo", "Perdidos", ""],
    ["rec", "Recibidos", ""], ["fut", "Más adelante", ""]];
  const grupos = G.map(([k, t, sub]) => {
    const l = by(k);
    if (!l.length) return "";
    const head = `<span class="dot">${ic(ICON[k])}</span><span>${t}${sub ? `<span class="gsub">${sub}</span>` : ""}</span><span class="cnt">${l.length}</span>`;
    const rows = l.map((s) => {
      const inner = `<span class="si">${ic(ICON[k])}</span><span><span class="sn">${esc(s.nombre)}</span><span class="sl">${linea(s)}</span></span>`;
      return k === "amar" || k === "verde"
        ? `<li><button class="svc" data-act="entregar" data-sid="${s.id}" aria-label="Marcar como recibido: ${esc(s.nombre)}">${inner}<span class="ptag">${ic(IC.recibido)}Recibió</span></button></li>`
        : `<li class="svc plain">${inner}</li>`;
    }).join("");
    return `<details class="grp st-${k}"${k === "amar" || k === "verde" ? " open" : ""}><summary>${head}</summary><ul class="svcs">${rows}</ul></details>`;
  }).join("");
  const P = g.plan_parto, catP = S.cat?.plan_parto || {}, nP = P.marcados.length, okP = nP === P.total;
  const plan = g.trimestre === 3 ? `<details class="card fold st-${okP ? "rec" : "amar"}">
      <summary><span class="dot">${ic(okP ? IC.recibido : IC.alerta)}</span><h2>Plan de parto</h2><span class="pill st-${okP ? "rec" : "amar"}">${okP ? "Completo" : `Faltan ${P.total - nP}`}</span></summary>
      <p class="muted">Mire su ficha de plan de parto. Marque lo que tiene.</p>
      <div class="checks">${Object.entries(catP).map(([k, l]) => `<label><input type="checkbox" data-plan="${k}"${P.marcados.includes(k) ? " checked" : ""}>${esc(l)}</label>`).join("")}</div>
      <button class="big teal" data-act="plan">${ic(IC.recibido)}Guardar</button>
    </details>` : "";
  const hist = g.historial.length
    ? `<ul class="hist">${g.historial.map((v) => `<li class="${v.derivada ? "st-rojo" : "st-rec"}"><b>${fmt(v.fecha)}</b> · ${v.derivada ? "Avisamos a la posta" : "Visita"}</li>`).join("")}</ul>`
    : `<p class="muted">Sin visitas.</p>`;
  return `
  <section class="hero st-${g.bucket}">
    <div class="id"><span class="av">${initials(g.nombre)}</span><div><h2>${esc(g.nombre)}</h2>
      <span class="mt">${g.mes} meses de embarazo · ${esc(g.sector)}</span></div></div>
    <dl class="facts">
      <div><dt>PARTO</dt><dd>${fmt(g.fpp)}</dd></div>
      <div><dt>ÚLTIMA VISITA</dt><dd>${g.dias_desde_visita == null ? "Ninguna" : `Hace ${g.dias_desde_visita} d`}</dd></div>
      <div><dt>CELULAR</dt><dd><a href="tel:${esc(g.celular)}">${esc(g.celular)}</a></dd></div>
      <div><dt>EDAD</dt><dd>${g.edad} años</dd></div>
    </dl>
    ${g.prioridad.razones.length ? `<div class="cc">${g.prioridad.razones.slice(0, 3).map((r) => `<span class="pill st-${g.prioridad.nivel}">${esc(r)}</span>`).join("")}</div>` : ""}
  </section>
  <button class="big" data-act="visita" data-id="${g.id}">${ic("mic")}Grabar visita</button>
  ${plan}
  ${grupos}
  <details class="card fold"><summary><span class="dot st-fut">${ic(IC.visita)}</span><h2>Visitas</h2><span class="muted">${g.historial.length}</span></summary>${hist}</details>`;
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
      <span class="mt">DNI ${esc(g.dni)} · ${g.mes} meses de embarazo · Agente: ${esc(S.meta?.agente.split(" (")[0] || "")}</span></div></div>
  </section>`;

  if (v.fase === "inicio") {
    return `${datos}
    <section class="card rec" aria-labelledby="h-rec">
      <h2 id="h-rec">¿Ella acepta que grabe?</h2>
      <div class="si-no">${navigator.onLine ? `<button class="big" data-act="grabar">${ic("mic")}Sí, grabar</button>` : `<p class="banner st-amar">${ic(IC.alerta)}<span>Sin señal: llene a mano.</span></p>`}
        <button class="big ghost-b" data-act="manual">${ic("edit")}No, llenar a mano</button></div>
      ${v.error ? `<p class="banner st-rojo" role="alert">${ic("alert")}<span>${esc(v.error)}</span></p>` : ""}
      <button class="ghost" data-act="ejemplo">${ic("play")}Audio de ejemplo (demo)</button>
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
      <p class="muted">Pregunte: suplementos, signos de alarma y comida.</p>
      <button class="ghost" data-act="cancelar">Cancelar</button>
    </section>`;
  }
  if (v.fase === "procesando") {
    const st = (k, t) => `<li class="${v.paso > k ? "ok" : v.paso === k ? "on" : ""}">${v.paso > k ? ic("check") : v.paso === k ? `<span class="spin" aria-hidden="true"></span>` : ic("cal")}${t}</li>`;
    return `${datos}<section class="card" aria-live="polite"><h2>Procesando la visita</h2>
      <ol class="steps">${st(1, "Pasando la voz a texto (Whisper)")}${st(2, "Llenando la Ficha 3 con IA")}</ol></section>`;
  }
  const c = v.campos;
  const algunoNo = Object.values(c.suplementos).some((x) => x.valor === "no");
  const fuente = v.fuente === "ia" ? `<span class="pill st-ia">${ic("mic")}Llenado con IA · revise</span>`
    : v.fuente === "reglas" ? `<span class="pill st-amar">${ic("info")}Llenado automático · revise</span>` : "";
  const ficha = `
    ${v.texto ? `<section class="card">
      <div class="cc">${fuente}</div>
      ${v.texto ? `<details><summary class="link">${ic("doc")}Ver lo que se grabó</summary>
        <label class="sr" for="tx">Transcripción</label><textarea id="tx">${esc(v.texto)}</textarea>
        <button class="sec" data-act="rellenar">${ic("mic")}Llenar otra vez</button></details>` : ""}
    </section>` : ""}
    <section class="card" aria-labelledby="h-c9"><h2 id="h-c9">Suplementos</h2>
      ${Object.entries(cat.suplementos).map(([k, l], i) => triHTML("suplementos", k, l, c.suplementos[k].valor, c.suplementos[k].evidencia, false).replace('class="q"', i ? 'class="q"' : 'class="q first"')).join("")}
    </section>
    ${algunoNo ? `<section class="card" aria-labelledby="h-c10"><h2 id="h-c10">¿Por qué no lo toma?</h2>
      <div class="checks">${Object.entries(cat.motivos).map(([k, l]) => `<label><input type="checkbox" data-motivo="${k}" ${c.motivos.includes(k) ? "checked" : ""}>${esc(l)}</label>`).join("")}</div></section>` : ""}
    <section class="card" aria-labelledby="h-c11"><h2 id="h-c11">Signos de alarma</h2><p class="muted">Pregunte por todos. Si hay uno, avisamos a la posta.</p>
      ${v.error ? `<p class="banner st-rojo" role="alert">${ic(IC.alerta)}<span>${esc(v.error)}</span></p>` : ""}
      ${Object.entries(cat.signos).map(([k, l]) => triHTML("signos", k, l, c.signos[k].valor, c.signos[k].evidencia, true)).join("")}
    </section>
    <section class="card" aria-labelledby="h-c12"><h2 id="h-c12">Hábitos</h2>
      ${Object.entries(cat.habitos).map(([k, l], i) => triHTML("habitos", k, l, c.habitos[k].valor, c.habitos[k].evidencia, false).replace('class="q"', i ? 'class="q"' : 'class="q first"')).join("")}
    </section>`;
  if (v.fase === "ficha") {
    return `${datos}${ficha}<button class="big" data-act="mensajes">${ic("msg")}Ver qué decirle</button>`;
  }
  // fase "mensajes"
  const R = v.res;
  if (!R) return `${datos}<section class="card" aria-live="polite"><ol class="steps"><li class="on"><span class="spin"></span>Preparando los mensajes…</li></ol></section>`;
  const sit = R.mensajes.filter((m) => m.origen === "situacion"), tri = R.mensajes.filter((m) => m.origen === "trimestre");
  const msg = (m) => `<article class="msg${m.origen === "situacion" ? " sit" : ""}"><div class="mh"><h3>${esc(m.titulo)}</h3></div><p class="say">${esc(m.decir)}</p></article>`;
  return `${datos}
    ${R.derivacion ? `<section class="card deriv" role="alert" aria-labelledby="h-d">
      <div class="banner st-rojo">${ic(IC.derivacion)}<div><b id="h-d">Avise ahora a la posta</b>Tiene signos de alarma. Dígale a la gestante que vaya hoy.</div></div>
      ${(R.derivacion.avisos || []).length ? `<p class="ok-aviso">${ic(IC.recibido)}Avisó por ${R.derivacion.avisos.map((a) => `${CANAL[a.canal]} (${esc(a.hora)})`).join(", ")}</p>` : ""}
      ${v.error ? `<p class="banner st-rojo" role="alert">${ic(IC.alerta)}<span>${esc(v.error)}</span></p>` : ""}
      <a class="big wa-btn" href="${esc(R.derivacion.whatsapp)}" data-aviso="whatsapp">${ic("msg")}Enviar por WhatsApp</a>
      <a class="big ghost-b" href="${esc(R.derivacion.sms)}" data-aviso="sms">${ic("msg")}Enviar SMS (sin internet)</a>
      <a class="big red" href="${esc(R.derivacion.tel)}" data-aviso="llamada">${ic(IC.derivacion)}Llamar a la posta</a>
      <details class="fold"><summary><h2>Ver el mensaje</h2></summary><p class="wa-bubble">${esc(R.derivacion.texto)}</p></details>
    </section>` : ""}
    ${R.sinSenal ? `<p class="banner st-amar">${ic(IC.alerta)}<span>Sin señal: los consejos se verán cuando haya señal.</span></p>` : ""}
    <section class="card" aria-labelledby="h-m"${R.mensajes.length ? "" : " hidden"}><div class="sec-head"><h2 id="h-m">Qué decirle</h2>${R.fuente === "ia" ? `<span class="pill st-ia">${ic("mic")}Redactado con IA</span>` : ""}</div>
      ${sit.length ? `<h3>Por lo que encontró</h3>${sit.map(msg).join("")}` : ""}
      ${tri.length ? `<h3>Por sus meses de embarazo</h3>${tri.map(msg).join("")}` : ""}
    </section>
    ${(R.para_la_posta || []).length ? `<div class="banner st-amar">${ic(IC.recordatorio)}<div><b>Recuérdele ir a la posta para:</b><ul>${R.para_la_posta.map((r) => `<li>${esc(r)}</li>`).join("")}</ul></div></div>` : ""}
    <button class="big teal" data-act="guardar">${ic("check")}Guardar visita</button>
    <button class="ghost" data-act="volver-ficha">Volver a la Ficha 3</button>`;
}

function vAyuda() {
  const cat = S.cat || {};
  const box = (icon, t, body) => `<details class="card fold"><summary><span class="dot st-recomendada">${ic(icon)}</span><h2>${t}</h2></summary><div class="hb">${body}</div></details>`;
  const mes = (s) => (s.desde === s.hasta ? `Mes ${s.desde}` : `Mes ${s.desde} a ${s.hasta}`);
  const porMes = {};
  const sumar = (m, n) => (porMes[m] = porMes[m] || []).push(n);
  (cat.paquete || []).forEach((s) => (s.id === "plan" ? [7, 8, 9].forEach((m) => sumar(`Mes ${m}`, "Revisión de plan de parto")) : sumar(mes(s), s.nombre)));
  const paquete = Object.entries(porMes).map(([m, n]) => `<li${n.includes("Revisión de plan de parto") ? ' class="hl"' : ""}><b>${m}</b><span>${esc(n.join(" · "))}</span></li>`).join("");
  const colores = COLORES.map(([k, t, d]) => `<div class="lg st-${k}"><span class="dot">${ic(ICON[k])}</span><div><b>${t}</b>${d}</div></div>`).join("");
  const signos = Object.values(cat.signos || {}).map((s) => `<li>${esc(s)}</li>`).join("");
  return `
  ${box("users", "Tu rol", `<p>Tú <b>no das servicios</b>.</p><p>Tú <b>visitas, recuerdas y avisas a la posta</b>.</p>
    <ul><li>2 visitas al mes, cada 13 a 15 días.</li><li>20 minutos o más por visita.</li><li>Signo de alarma: avisa a la posta por WhatsApp, SMS o llamada.</li></ul>`)}
  ${box("doc", "Servicios de cada gestante", `<p>Los recibe en el establecimiento de salud.</p><ul class="pkg">${paquete}</ul>
    <p class="muted">El plan de parto se revisa desde el mes 7.</p>`)}
  ${box(IC.alerta, "Colores", colores)}
  ${box("route", "Cómo se arma la ruta", `<ol><li>Primero: alertas y servicios por vencer.</li><li>Luego: visitas vencidas.</li>
    <li>Junta las casas cercanas para caminar menos.</li><li>Entra en tu tiempo del día.</li></ol>`)}
  ${box(IC.derivacion, "Signos de alarma", `<ul>${signos}</ul><p>Si hay uno, la app prepara un mensaje corto. Usted lo envía por <b>WhatsApp</b> o <b>SMS</b> (sin internet) y <b>llama</b> a la posta: <b>${esc(S.meta?.eess || "")}</b>.</p>`)}
  ${box("mic", "Grabar la Ficha 3", `<p>Pida permiso y grabe la conversación. La app llena:</p>
    <ul><li>Suplementos</li><li>Por qué no los toma</li><li>Signos de alarma</li><li>Hábitos</li></ul><p>Y le da los mensajes para la gestante. Revise antes de guardar.</p>`)}
  ${box("info", "Fuente normativa", `<ul>
    <li><b>RM 241-2024-MINSA</b>: visita domiciliaria por actor social y Ficha 3 de la gestante.</li>
    <li><b>NTS 105-MINSA/DGSP-V.01</b> (RM 827-2013-MINSA): atención integral de la salud materna.</li>
    <li><b>Ficha de plan de parto</b> del establecimiento de salud.</li></ul>
    <p class="muted">Las fechas de cada servicio siguen el formato de seguimiento del programa.</p>`)}
  <button class="sec" data-act="reiniciar">Reiniciar demo</button>
  <p class="foot">Puriq Lite · datos ficticios</p>`;
}

// ─────────────────────────────── render y navegación
const main = $("#main"), topEl = $("#top"), nav = $("#nav");
let mapa = null, lastView = null;

function render() {
  if (S.acceso) { topEl.hidden = true; nav.hidden = true; main.innerHTML = vAcceso(); return; }
  topEl.hidden = false; nav.hidden = false;
  const v = S.view;
  const titulo = { ficha: S.det?.nombre || "Gestante", visita: "Visita domiciliaria", ayuda: "Ayuda" }[v];
  topEl.innerHTML = titulo && v !== "ayuda"
    ? `<button class="back" data-act="back">${ic("back")}Volver</button><h1>${esc(titulo)}</h1>`
    : `<span class="brand"><svg class="logo" viewBox="0 0 64 64" aria-hidden="true"><use href="#i-puriq"/></svg>puriq <span class="lite">LITE</span></span>${estadoSenal()}<button class="lockbtn" data-acc="bloquear" aria-label="Bloquear la app">${ic("lock")}</button>`;
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
  L.geoJSON(R.geo.ruta, { style: { color: "#245A45", weight: 4, dashArray: "8 8", opacity: 0.85 } }).addTo(mapa);
  R.geo.casas.features.forEach((f) => {
    const p = f.properties, [lon, lat] = f.geometry.coordinates, col = NIVEL[p.nivel].color;
    const pop = `<b>${esc(p.nombre)}</b><br>${NIVEL[p.nivel].t}${p.orden ? ` · parada ${p.orden}` : ""}`;
    if (p.orden) {
      L.marker([lat, lon], { icon: L.divIcon({ className: "", html: `<span class="mk" style="background:${col}">${p.orden}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] }), title: p.nombre, zIndexOffset: 500 })
        .addTo(mapa).bindPopup(pop);
    } else {
      L.circleMarker([lat, lon], { radius: 7, color: "#26352F", weight: 1.5, fillColor: col, fillOpacity: 0.9 }).addTo(mapa).bindPopup(pop);
    }
  });
  L.marker([R.inicio.lat, R.inicio.lon], { icon: L.divIcon({ className: "", html: `<span class="mk start">${ic("hosp")}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] }), title: R.inicio.nombre })
    .addTo(mapa).bindPopup(`<b>${esc(R.inicio.nombre)}</b><br>Punto de partida`);
}

function horaAhora() {
  const d = new Date();
  if (d.getHours() >= 17 || d.getHours() < 7) return "08:00"; // fuera de horario: ruta de mañana
  const m = Math.ceil(d.getMinutes() / 5) * 5;
  d.setMinutes(m, 0, 0);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

async function cargarLista() {
  [S.lista, S.ruta] = await Promise.all([api("/api/gestantes"), api(`/api/ruta?jornada=${S.jornada}&hora=${horaAhora()}`)]);
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
    v.error = "Este celular no deja grabar. Llene a mano.";
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
  } catch (e) {
    if (!navigator.onLine) v.res = mensajesSinSenal(v);
    else { v.fase = "ficha"; toast(e.message); }
  }
  render();
}

async function guardarVisita() {
  const v = S.v, R = v.res;
  // Seguridad: con signos de alarma no se guarda sin haber avisado a la posta.
  if (R.derivacion && !(R.derivacion.avisos || []).length) {
    v.error = "Primero avise a la posta: WhatsApp, SMS o llamada.";
    render(); $(".deriv")?.scrollIntoView({ block: "start" });
    return;
  }
  try {
    const res = await api("/api/visita/guardar", { method: "POST", body: JSON.stringify({
      gestante_id: v.pid, campos: soloValores(v.campos), urgente: R.urgente, referencias: R.referencias,
      mensajes: R.mensajes, consentimiento: v.consentimiento ?? null,
      resumen: (v.fuente === "ia" && v.resumen) || R.referencias.join(" · ") || "Visita realizada sin hallazgos.",
      duracion_s: v.duracion ? Math.round(v.duracion) : v.seg || null }) });
    S.v = null;
    if (res._sinSenal) { toast("Guardada sin señal. Se enviará cuando haya señal."); go("ficha", { pid: S.det.id }); return; }
    S.det = res;
    await cargarLista();
    toast(R.urgente ? "Visita guardada · avisamos a la posta" : "Visita guardada");
    go("ficha", { pid: S.det.id });
  } catch (e) { toast(e.message); }
}

// ─────────────────────────────── acceso: activar celular, PIN y bloqueo
function vAcceso() {
  const a = S.acceso, primer = (ACC?.agente?.nombre || "").split(" ")[0];
  const marca = `<div class="login-brand"><svg class="login-logo" viewBox="0 0 64 64" aria-hidden="true"><use href="#i-puriq"/></svg><b>puriq</b><span>rutas que cuidan</span></div>`;
  const err = S.accErr ? `<p class="login-err" role="alert">${ic(IC.alerta)}<span>${esc(S.accErr)}</span></p>` : "";
  if (a === "activar") {
    return `<section class="login">${marca}<div class="login-card">
      <span class="login-ic" aria-hidden="true">${ic("hosp")}</span>
      <h1>Active su celular</h1><p class="muted">Escriba el código de 6 números que le dio la posta.</p>
      <label class="sr" for="codigo">Código de activación</label>
      <input id="codigo" class="code-input" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="······"${S.ocupado ? " disabled" : ""}>
      ${err}<button class="big" data-acc="activar">${S.ocupado ? "Activando…" : "Activar"}</button>
      <p class="login-hint">Demo: código <b>482913</b></p></div></section>`;
  }
  const msg = { crear: "Cree su clave de 4 números", confirmar: "Repita su clave", bloqueo: "Escriba su clave" }[a];
  const dots = [0, 1, 2, 3].map((i) => `<i class="${i < S.pin.length ? "on" : ""}"></i>`).join("");
  const teclas = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "borrar"].map((k) => (k === "" ? "<span></span>"
    : `<button class="key${k === "borrar" ? " del" : ""}" data-acc="tecla" data-k="${k}" aria-label="${k === "borrar" ? "Borrar" : k}">${k === "borrar" ? ic("back") : k}</button>`)).join("");
  return `<section class="login">${marca}<div class="login-card">
    <h1>Hola, ${esc(primer)}</h1><p class="muted" aria-live="polite">${S.verificando ? "Verificando…" : msg}</p>
    <div class="dots" role="status" aria-label="${S.pin.length} de 4 números">${dots}</div>
    ${err}<div class="keypad">${teclas}</div>
    ${a === "bloqueo" ? `<button class="link" data-acc="olvide">Olvidé mi clave</button>` : `<p class="login-hint">No la comparta. La usará cada vez que entre.</p>`}
  </div></section>`;
}

async function hashPin(pin, salB64) {
  const sal = Uint8Array.from(atob(salB64), (c) => c.charCodeAt(0));
  const llave = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: sal, iterations: 150000, hash: "SHA-256" }, llave, 256);
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}

async function accionAcceso(acc, k) {
  if (acc === "bloquear") return bloquear();
  if (acc === "olvide") {
    if (confirm("Para volver a entrar necesitará un código nuevo de la posta. ¿Continuar?")) salir("Pida un código nuevo a la posta.");
    return;
  }
  if (acc === "activar") {
    const codigo = ($("#codigo")?.value || "").trim();
    if (!/^\d{6}$/.test(codigo)) { S.accErr = "El código tiene 6 números."; return render(); }
    S.ocupado = true; S.accErr = ""; render();
    try {
      const r = await api("/api/auth/activar", { method: "POST", body: JSON.stringify({ codigo }) });
      ACC = { token: r.token, agente: r.agente, fallos: 0 }; guardarLS(AUTH_KEY, ACC);
      S.acceso = "crear"; S.pin = "";
    } catch (e) {
      S.accErr = navigator.onLine ? e.message : "Necesita señal para activar (solo la primera vez).";
    }
    S.ocupado = false;
    return render();
  }
  if (acc === "tecla") {
    if (S.verificando) return;
    if (k === "borrar") S.pin = S.pin.slice(0, -1);
    else if (S.pin.length < 4) S.pin += k;
    S.accErr = ""; render();
    if (S.pin.length === 4) await procesarPin();
  }
}

async function procesarPin() {
  const pin = S.pin;
  S.verificando = S.acceso !== "crear";
  if (S.verificando) { render(); await new Promise((r) => setTimeout(r, 30)); }
  S.pin = "";
  if (S.acceso === "crear") { S.pin1 = pin; S.acceso = "confirmar"; return render(); }
  if (S.acceso === "confirmar") {
    if (pin !== S.pin1) { S.verificando = false; S.acceso = "crear"; S.accErr = "No coinciden. Cree su clave otra vez."; return render(); }
    const sal = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
    ACC.pin = { sal, hash: await hashPin(pin, sal) }; ACC.fallos = 0; S.pin1 = "";
    guardarLS(AUTH_KEY, ACC);
    return desbloquear();
  }
  // Desbloqueo: se verifica en el celular, sin señal.
  if ((await hashPin(pin, ACC.pin.sal)) === ACC.pin.hash) { ACC.fallos = 0; guardarLS(AUTH_KEY, ACC); return desbloquear(); }
  ACC.fallos = (ACC.fallos || 0) + 1; guardarLS(AUTH_KEY, ACC);
  navigator.vibrate?.(200);
  if (ACC.fallos >= MAX_FALLOS) return salir("5 intentos fallidos. Pida un código nuevo a la posta.");
  S.verificando = false;
  S.accErr = `Clave incorrecta. Le quedan ${MAX_FALLOS - ACC.fallos} ${plural(MAX_FALLOS - ACC.fallos, "intento", "intentos")}.`;
  render();
}

let ultimaActividad = Date.now();
function desbloquear() {
  S.acceso = null; S.accErr = ""; S.verificando = false; ultimaActividad = Date.now();
  if (!S.meta) arrancarApp(); else { render(); enviarPendientes(); }
}
function bloquear() {
  if (!ACC?.pin || S.v?.fase === "grabando") return; // no se corta una grabación en curso
  S.acceso = "bloqueo"; S.pin = ""; S.accErr = ""; render();
}
function salir(msg) {
  ACC = null;
  try { localStorage.removeItem(AUTH_KEY); } catch (_) {}
  Object.assign(S, { acceso: "activar", verificando: false, pin: "", accErr: msg || "", meta: null, lista: null, ruta: null, det: null, v: null });
  render();
}
["pointerdown", "keydown", "touchstart", "scroll"].forEach((ev) =>
  window.addEventListener(ev, () => { if (!S.acceso) ultimaActividad = Date.now(); }, { passive: true }));
setInterval(() => { if (!S.acceso && Date.now() - ultimaActividad > BLOQUEO_MS) bloquear(); }, 15000);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && !S.acceso && Date.now() - ultimaActividad > BLOQUEO_MS) bloquear();
});
document.addEventListener("keydown", (e) => {
  if (!S.acceso) return;
  if (S.acceso === "activar") { if (e.key === "Enter") accionAcceso("activar"); return; }
  if (/^\d$/.test(e.key)) accionAcceso("tecla", e.key);
  else if (e.key === "Backspace") accionAcceso("tecla", "borrar");
});
window.addEventListener("online", enviarPendientes);
window.addEventListener("offline", () => { if (!S.acceso) render(); });

function mensajesSinSenal(v) {
  // Sin señal no hay servidor: se arma igual el aviso a la posta (SMS y llamada funcionan sin datos).
  const g = S.det, num = (S.meta?.telefono_posta || "").replace("+", "");
  const signos = Object.entries(v.campos.signos).filter(([, x]) => x.valor === "si").map(([k]) => S.cat.signos[k]);
  const h = new Date(), hora = `${String(h.getHours()).padStart(2, "0")}:${String(h.getMinutes()).padStart(2, "0")}`;
  const texto = `PURIQ - Signos de alarma. Gestante ${g.nombre}, ${g.mes} meses de embarazo, ${g.sector}. Signos: ${signos.map((x) => x.toLowerCase()).join("; ")}. Le dije que vaya hoy a la posta. Promotora ${(S.meta?.agente || "").split(" (")[0]}, ${hora}.`;
  return {
    sinSenal: true, urgente: signos.length > 0, mensajes: [], para_la_posta: [], cierre: "",
    referencias: signos.length ? [`Presenta signos de alarma: ${signos.join("; ").toLowerCase()}`] : [],
    trimestre: g.trimestre, semana: g.semana,
    derivacion: signos.length ? { para: S.meta?.eess, texto, avisos: [],
      whatsapp: `https://wa.me/${num}?text=${encodeURIComponent(texto)}`, sms: `sms:+${num}?body=${encodeURIComponent(texto)}`, tel: `tel:+${num}` } : null,
  };
}

// ─────────────────────────────── eventos
let UNDO = null, TT = null;
function toast(msg, undo) {
  const t = $("#toast"); UNDO = undo || null;
  t.innerHTML = `${ic("check")}<span>${esc(msg)}</span>${undo ? `<button data-act="undo">Deshacer</button>` : ""}`;
  t.hidden = false; clearTimeout(TT); TT = setTimeout(() => { t.hidden = true; UNDO = null; }, 6000);
}

document.addEventListener("click", async (e) => {
  const ba = e.target.closest("[data-acc]");
  if (ba) { await accionAcceso(ba.dataset.acc, ba.dataset.k); return; }
  // Aviso a la posta: el enlace abre WhatsApp, SMS o la app de llamadas del celular; aquí solo se registra.
  const av = e.target.closest("[data-aviso]");
  if (av && S.v?.res?.derivacion) {
    const canal = av.dataset.aviso, d = S.v.res.derivacion;
    const cuerpo = JSON.stringify({ gestante_id: S.v.pid, canal });
    api("/api/visita/aviso", { method: "POST", body: cuerpo, keepalive: true }).catch(() => {});
    const h = new Date();
    d.avisos = [...(d.avisos || []), { canal, hora: `${String(h.getHours()).padStart(2, "0")}:${String(h.getMinutes()).padStart(2, "0")}` }];
    S.v.error = "";
    setTimeout(render, 400);
    return;
  }
  const b = e.target.closest("[data-act]"); if (!b) return;
  const a = b.dataset.act, v = S.v;
  if (a === "go") go(b.dataset.view);
  else if (a === "back") history.length > 1 ? history.back() : go("inicio");
  else if (a === "open") go("ficha", { pid: b.dataset.id });
  else if (a === "visita") { if (!S.v || S.v.pid !== b.dataset.id) S.v = nuevaVisita(b.dataset.id); go("visita", { pid: b.dataset.id }); }
  else if (a === "list") { S.filtro = b.dataset.f; go("gestantes"); }
  else if (a === "filtro") { S.filtro = b.dataset.f; render(); }
  else if (a === "jornada") { S.jornada = Number(b.dataset.min); S.ruta = await api(`/api/ruta?jornada=${S.jornada}&hora=${horaAhora()}`); render(); }
  else if (a === "plan") {
    const marcados = [...document.querySelectorAll("[data-plan]:checked")].map((x) => x.dataset.plan);
    const res = await api(`/api/gestantes/${S.det.id}/plan-parto`, { method: "POST", body: JSON.stringify({ marcados }) });
    if (res._sinSenal) { S.det.plan_parto.marcados = marcados; render(); toast("Guardado sin señal. Se enviará después."); return; }
    S.det = res;
    render(); cargarLista();
    const falta = S.det.plan_parto.total - S.det.plan_parto.marcados.length;
    toast(falta ? `Guardado · faltan ${falta}` : "Plan de parto completo");
  }
  else if (a === "entregar") {
    const sid = b.dataset.sid, gid = S.det.id;
    const res = await api(`/api/gestantes/${gid}/servicios/${sid}`, { method: "POST", body: JSON.stringify({}) });
    if (res._sinSenal) { const sv = S.det.servicios.find((x) => x.id === sid); if (sv) sv.estado = "rec"; render(); toast("Guardado sin señal. Se enviará después."); return; }
    S.det = res;
    render(); cargarLista();
    toast("Marcado como recibido", async () => { S.det = await api(`/api/gestantes/${gid}/servicios/${sid}`, { method: "DELETE" }); render(); cargarLista(); });
  }
  else if (a === "undo") { $("#toast").hidden = true; if (UNDO) UNDO(); }
  else if (a === "grabar") { v.consentimiento = true; grabar(); }
  else if (a === "parar") pararGrabacion(true);
  else if (a === "cancelar") pararGrabacion(false);
  else if (a === "ejemplo") {
    try {
      v.consentimiento = true;
      const ej = await api("/api/demo/ejemplo");
      if (ej.audio) procesarAudio(await (await fetch(ej.audio, { headers: { "X-Token": ACC?.token || "" } })).blob());
      else { v.texto = ej.texto; llenar(); }
    } catch (err) { v.error = err.message; render(); }
  }
  else if (a === "manual") { v.consentimiento = v.consentimiento ?? false; v.campos = camposVacios(); v.fuente = null; v.fase = "ficha"; render(); }
  else if (a === "rellenar") { v.texto = $("#tx").value; llenar(); }
  else if (a === "campo") { v.campos[b.dataset.g][b.dataset.k].valor = b.dataset.v; if (b.dataset.g === "signos") v.error = ""; render(); }
  else if (a === "mensajes") {
    // Seguridad: no se avanza si algún signo de alarma quedó sin preguntar.
    const faltan = Object.entries(v.campos.signos).filter(([, x]) => x.valor === "nm").map(([k]) => S.cat.signos[k].toLowerCase());
    if (faltan.length) { v.error = `Falta preguntar: ${faltan.join("; ")}.`; render(); $("#h-c11")?.scrollIntoView({ block: "start" }); return; }
    v.error = ""; generarMensajes();
  }
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
});
window.addEventListener("hashchange", route);

async function arrancarApp() {
  try {
    [S.meta, S.cat] = await Promise.all([api("/api/estado"), api("/api/ficha3/catalogo")]);
    await cargarLista();
  } catch (e) {
    main.innerHTML = `<div class="empty">Sin señal y todavía no hay datos guardados en este celular. Conéctese una vez para descargarlos.</div>`;
    return;
  }
  route();
  enviarPendientes();
}

(function init() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  Object.assign(S, { pin: "", pin1: "", accErr: "", ocupado: false });
  S.acceso = !ACC?.token ? "activar" : !ACC.pin ? "crear" : "bloqueo";
  render();
})();
