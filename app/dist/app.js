"use strict";const $=a=>document.querySelector(a),esc=a=>String(a??"").replace(/[&<>"']/g,e=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[e]),ic=(a,e="")=>`<svg class="ic ${e}" aria-hidden="true"><use href="#i-${a}"/></svg>`,plural=(a,e,s)=>a===1?e:s,initials=a=>a.split(" ").slice(0,2).map(e=>e[0]).join("").toUpperCase(),parseISO=a=>{const[e,s,n]=a.slice(0,10).split("-").map(Number);return new Date(e,s-1,n)},fmt=a=>parseISO(a).toLocaleDateString("es-PE",{day:"numeric",month:"short"}).replace(/\./g,""),fmtL=a=>a.toLocaleDateString("es-PE",{weekday:"long",day:"numeric",month:"long"}),cap=a=>a.charAt(0).toUpperCase()+a.slice(1),TRIM={1:"I",2:"II",3:"III"};async function api(a,e={}){const s=await fetch(a,{headers:e.body&&!(e.body instanceof FormData)?{"Content-Type":"application/json"}:{},...e});if(!s.ok){let n=`Error ${s.status}`;try{n=(await s.json()).detail||n}catch{}throw new Error(n)}return s.json()}const NIVEL={urgente:{t:"Urgente",i:"alert",color:"#D12F2F"},vencida:{t:"Visita vencida",i:"cal",color:"#B97F00"},toca:{t:"Le toca visita",i:"bell",color:"#2B8E4E"},recomendada:{t:"Recomendada",i:"info",color:"#1F4E8C"},al_dia:{t:"Al d\xEDa",i:"check",color:"#8A92A3"}},BUCKET={rojo:["Con perdidos","x"],amar:["Con pendientes","alert"],ok:["Al d\xEDa","check"]},ICON={rojo:"x",amar:"alert",verde:"bell",rec:"check",fut:"cal"},pillNivel=a=>`<span class="pill st-${a}">${ic(NIVEL[a].i)}${NIVEL[a].t}</span>`,S={view:"inicio",pid:null,filtro:"all",q:"",jornada:240,meta:null,lista:null,ruta:null,cat:null,det:null,v:null};function nuevaVisita(a){return{pid:a,fase:"inicio",texto:"",campos:null,fuente:null,resumen:"",res:null,compromiso:"",seg:0,error:""}}function vInicio(){const a=S.lista||[],e=S.meta?.hoy?parseISO(S.meta.hoy):new Date,s=new Date().getHours(),n=s<12?"Buenos d\xEDas":s<19?"Buenas tardes":"Buenas noches",t=(S.meta?.agente||"").split(" ")[0],r=a.filter(c=>c.prioridad.nivel==="urgente"),i={rojo:0,amar:0,ok:0};a.forEach(c=>i[c.bucket]++);const p=a.filter(c=>c.prioridad.nivel==="vencida").length,m=a.filter(c=>c.prioridad.nivel==="toca").length,l=S.ruta?.totales,v=["rojo","amar","ok"].map(c=>i[c]?`<i class="st-${c}" style="flex:${i[c]}"></i>`:"").join("");return`
  <header class="greet"><h2>${n}, ${esc(t)}</h2><p>${esc(cap(fmtL(e)))} \xB7 ${esc(S.meta?.localidad||"")}, ${esc(S.meta?.region||"")}</p></header>
  ${r.length?`<section class="card" aria-labelledby="h-al"><div class="sec-head"><h2 id="h-al">Alertas de hoy</h2><span class="muted">${r.length}</span></div>
    ${r.map(c=>`<button class="alert st-urgente" data-act="open" data-id="${c.id}">
      <span class="ai">${ic("alert")}</span><span><b>${esc(c.nombre)}</b><small>${esc(c.prioridad.razones[0]||"")}</small></span>${ic("chev")}</button>`).join("")}
  </section>`:""}
  <button class="cta" data-act="go" data-view="ruta">
    <span class="ci">${ic("route")}</span>
    <span><b>Tu ruta de hoy</b><span>${l?`${l.visitas} ${plural(l.visitas,"visita","visitas")} \xB7 ${l.km} km \xB7 terminas a las ${l.fin}`:"Calculando\u2026"}</span></span>${ic("chev","go")}
  </button>
  <section class="card" aria-labelledby="h-g">
    <div class="sec-head"><h2 id="h-g">Gestantes</h2><span class="muted">${a.length} en tu sector</span></div>
    <div class="bar" aria-hidden="true">${v}</div>
    <div class="tiles">
      ${[["rojo","Perdidos","no se recuperan"],["amar","Pendientes","por recuperar"],["ok","Al d\xEDa","todo en orden"]].map(([c,d,o])=>`<button class="tile st-${c}${i[c]?"":" zero"}" data-act="list" data-f="${c}" aria-label="${d}: ${i[c]} gestantes">
          <span class="ti">${ic(BUCKET[c][1])}</span><span class="tn">${i[c]}</span><span class="tl">${d}<small>${o}</small></span></button>`).join("")}
    </div>
    <div class="chips">
      <button class="fchip st-vencida" data-act="list" data-f="vencida" aria-pressed="false">${ic("cal")}${p} con visita vencida</button>
      <button class="fchip st-toca" data-act="list" data-f="toca" aria-pressed="false">${ic("bell")}${m} les toca visita</button>
    </div>
  </section>
  <section class="card" aria-label="Qu\xE9 significan los colores">
    <h3>Qu\xE9 significan los colores</h3>
    <div class="lg st-rojo"><span class="dot">${ic("x")}</span><div><b>Perdido</b>Pas\xF3 su fecha y ya no se puede recuperar.</div></div>
    <div class="lg st-amar"><span class="dot">${ic("alert")}</span><div><b>Pendiente</b>Pas\xF3 su fecha, pero todav\xEDa se puede hacer.</div></div>
    <div class="lg st-verde"><span class="dot">${ic("bell")}</span><div><b>Servicio pr\xF3ximo</b>Est\xE1 en su fecha y a\xFAn no se entrega.</div></div>
    <button class="link" data-act="go" data-view="ayuda">${ic("info")}C\xF3mo se calcula la ruta y los colores</button>
  </section>
  <p class="foot">Versi\xF3n Lite \xB7 datos ficticios para demostraci\xF3n</p>`}function vRuta(){const a=S.ruta;if(!a)return'<div class="empty">Calculando la ruta\u2026</div>';const e=a.totales,s=[180,240,300,360].map(t=>`<button data-act="jornada" data-min="${t}" aria-pressed="${S.jornada===t}">${t/60} h</button>`).join(""),n=a.paradas.map(t=>`
    <li class="stop st-${t.nivel}">
      <span class="num" aria-hidden="true">${t.n}</span>
      <div class="box">
        <div class="when"><span>${ic("cal")} Llega ${t.llegada}</span><span>${t.camino_min} min a pie \xB7 ${t.camino_m} m</span></div>
        <span class="nm">${t.n}. ${esc(t.nombre)}</span>
        <span class="mt">Semana ${t.semana} \xB7 ${esc(t.direccion)}</span>
        <div class="cc">${pillNivel(t.nivel)}</div>
        <ul>${t.razones.slice(0,3).map(r=>`<li>${esc(r)}</li>`).join("")}</ul>
        <div class="acts">
          <button class="sec" data-act="visita" data-id="${t.id}">${ic("mic")}Iniciar visita</button>
          <button class="sec" data-act="open" data-id="${t.id}">Ver ficha</button>
        </div>
      </div>
    </li>`).join("");return`
  <section class="card" aria-labelledby="h-r">
    <div class="sec-head"><h2 id="h-r">Ruta de hoy</h2><span class="muted">Sale ${a.hora_inicio} del ${esc(a.inicio.nombre)}</span></div>
    <div><span class="muted" id="lj">Tiempo disponible</span><div class="seg" role="group" aria-labelledby="lj">${s}</div></div>
    <div class="stats">
      <div class="stat"><b>${e.visitas}</b><span>${plural(e.visitas,"visita","visitas")}</span></div>
      <div class="stat"><b>${e.km}</b><span>km a pie</span></div>
      <div class="stat"><b>${e.fin}</b><span>terminas</span></div>
    </div>
    ${e.ahorro_pct>0?`<p class="save">${ic("check")}Caminas ${e.ahorro_pct} % menos que visitando en el orden de la lista (${e.km_sin_optimizar} km).</p>`:""}
    <div id="map" role="img" aria-label="Mapa de Quinua con las casas de las gestantes y la ruta numerada"></div>
    <p class="muted">Primero las urgentes; luego las que suman m\xE1s prioridad por minuto de camino. Cada visita cuenta 25 min (la norma pide al menos 20).</p>
  </section>
  ${a.paradas.length?`<ol class="stops" aria-label="Paradas en orden">${n}</ol>`:'<div class="empty">No hay visitas pendientes para hoy.</div>'}
  ${a.fuera.length?`<details class="card"><summary class="link">No entran hoy (${a.fuera.length}): quedan para ma\xF1ana</summary>
    <ul class="list">${a.fuera.map(t=>`<li><button class="row st-${t.nivel}" data-act="open" data-id="${t.id}"><span class="av">${initials(t.nombre)}</span>
      <span><span class="nm">${esc(t.nombre)}</span><span class="cc">${pillNivel(t.nivel)}</span></span>${ic("chev")}</button></li>`).join("")}</ul></details>`:""}`}function vGestantes(){const a=(S.lista||[]).slice(),e=S.filtro,s=S.q.trim().toLowerCase(),n=i=>(e==="all"||i.bucket===e||i.prioridad.nivel===e)&&(!s||i.nombre.toLowerCase().includes(s)||i.sector.toLowerCase().includes(s)),t=a.filter(n).sort((i,p)=>p.prioridad.puntaje-i.prioridad.puntaje),r=(i,p,m)=>`<button class="fchip ${m?"st-"+m:""}" data-act="filtro" data-f="${i}" aria-pressed="${e===i}">${p}</button>`;return`
  <label class="sr" for="q">Buscar gestante</label>
  <input id="q" class="search" type="search" placeholder="Buscar por nombre o sector" value="${esc(S.q)}" autocomplete="off">
  <div class="chips" role="group" aria-label="Filtrar">
    ${r("all","Todas")}${r("urgente","Urgentes","urgente")}${r("vencida","Visita vencida","vencida")}${r("rojo","Con perdidos","rojo")}${r("amar","Con pendientes","amar")}
  </div>
  <p class="muted" aria-live="polite">${t.length} ${plural(t.length,"gestante","gestantes")} \xB7 ordenadas por prioridad</p>
  ${t.length?`<ul class="list">${t.map(i=>{const p=i.conteo,m=i.dias_desde_visita==null?"sin visitas":`\xFAltima visita hace ${i.dias_desde_visita} ${plural(i.dias_desde_visita,"d\xEDa","d\xEDas")}`;return`<li><button class="row st-${i.bucket}" data-act="open" data-id="${i.id}">
      <span class="av">${initials(i.nombre)}</span>
      <span><span class="nm">${esc(i.nombre)}</span><span class="mt">Semana ${i.semana} \xB7 ${esc(i.sector)} \xB7 ${m}</span>
      <span class="cc">${i.prioridad.nivel!=="al_dia"?pillNivel(i.prioridad.nivel):""}
        ${[["rojo","x"],["amar","alert"],["verde","bell"]].filter(([l])=>p[l]).map(([l,v])=>`<span class="pill st-${l}">${ic(v)}${p[l]}</span>`).join("")}</span></span>
      ${ic("chev")}</button></li>`}).join("")}</ul>`:'<div class="empty">No hay gestantes con este filtro.</div>'}`}function svcLinea(a){return a.estado==="rec"?`Entregado${a.entregado_el?" \xB7 "+fmt(a.entregado_el):""}`:a.estado==="fut"?`Le toca del ${fmt(a.inicio)} al ${fmt(a.fin)}`:a.estado==="verde"?`En fecha \xB7 hasta el ${fmt(a.fin)}`:a.estado==="amar"?`Venci\xF3 el ${fmt(a.fin)} \xB7 se puede hacer hasta el parto`:`Venci\xF3 el ${fmt(a.fin)} \xB7 ya no se recupera`}function vFicha(){const a=S.det;if(!a)return'<div class="empty">Cargando\u2026</div>';const e=i=>a.servicios.filter(p=>p.estado===i),n=[["rojo","Perdidos","Ya no se pueden recuperar",!0],["amar","Pendientes","A\xFAn se pueden hacer: toque para registrar",!0],["verde","Servicios pr\xF3ximos","En su fecha: toque para registrar",!0],["fut","M\xE1s adelante","Todav\xEDa no corresponde",!1],["rec","Entregados","Ya se brindaron",!1]].map(([i,p,m,l])=>{const v=e(i);if(!v.length)return"";const c=`<span class="dot">${ic(ICON[i])}</span><span>${p}<span class="gsub">${m}</span></span><span class="cnt">${v.length}</span>`,d=`<ul class="svcs">${v.map(o=>{const u=`<span class="si">${ic(ICON[i])}</span><span><span class="sn">${esc(o.nombre)}</span><span class="sl">${svcLinea(o)}</span></span><span class="ptag">${o.mes_desde===o.mes_hasta?"Mes "+o.mes_desde:`Meses ${o.mes_desde}-${o.mes_hasta}`}</span>`;return i==="amar"||i==="verde"?`<li><button class="svc" data-act="entregar" data-sid="${o.id}" aria-label="Registrar entrega: ${esc(o.nombre)}">${u}</button></li>`:`<li class="svc${i==="rec"||i==="fut"?" plain":""}">${u}</li>`}).join("")}</ul>`;return l?`<section class="grp st-${i}"><div class="gh">${c}</div>${d}</section>`:`<details class="grp st-${i}"><summary>${c}</summary>${d}</details>`}).join(""),t=a.alerta,r=a.historial.length?`<ul class="hist">${a.historial.map(i=>`<li class="${i.urgente?"st-urgente":"st-rec"}"><b>${fmt(i.fecha)}</b> \xB7 ${i.origen==="app"?"Ficha 3 grabada":"Visita"}${i.urgente?" \xB7 <b>referida al EESS</b>":""}<br><span class="muted">${esc(i.resumen||(i.mensajes||[]).join(", "))}</span></li>`).join("")}</ul>`:'<p class="muted">Todav\xEDa no tiene visitas registradas.</p>';return`
  <section class="hero st-${a.bucket}">
    <div class="id"><span class="av">${initials(a.nombre)}</span><div><h2>${esc(a.nombre)}</h2>
      <span class="mt">Gestante \xB7 ${a.edad} a\xF1os \xB7 ${esc(a.sector)}</span></div></div>
    <dl class="facts">
      <div><dt>SEMANA</dt><dd>${a.semana} \xB7 Trim. ${TRIM[a.trimestre]}</dd></div>
      <div><dt>PARTO PROBABLE</dt><dd>${fmt(a.fpp)}</dd></div>
      <div><dt>\xDALTIMA VISITA</dt><dd>${a.dias_desde_visita==null?"Ninguna":`Hace ${a.dias_desde_visita} d`}</dd></div>
      <div><dt>CELULAR</dt><dd><a href="tel:${esc(a.celular)}">${esc(a.celular)}</a></dd></div>
      <div><dt>DIRECCI\xD3N</dt><dd>${esc(a.direccion)}</dd></div>
      <div><dt>PROGRAMA SOCIAL</dt><dd>${esc(a.programa_social)}</dd></div>
    </dl>
  </section>
  ${t?`<div class="banner st-urgente" role="alert">${ic("alert")}<div><b>Alerta reportada hace ${t.hace_horas} h</b>${esc(a.prioridad.razones[0])}</div></div>`:""}
  <button class="big" data-act="visita" data-id="${a.id}">${ic("mic")}Visita domiciliaria \xB7 Ficha 3</button>
  ${a.prioridad.razones.length?`<section class="card st-${a.prioridad.nivel}"><div class="sec-head"><h2>Por qu\xE9 visitarla</h2>${pillNivel(a.prioridad.nivel)}</div>
    <ul>${a.prioridad.razones.map(i=>`<li>${esc(i)}</li>`).join("")}</ul></section>`:""}
  ${n}
  <section class="card"><h2>Visitas</h2>${r}</section>`}const V_LBL={si:"S\xED",no:"No",nm:"No se habl\xF3"};function triHTML(a,e,s,n,t,r){return`<div class="q"><span class="ql" id="l-${a}-${e}">${esc(s)}</span>
    <div class="tri${r?" alarm":""}" role="group" aria-labelledby="l-${a}-${e}">
      ${["si","no","nm"].map(i=>`<button type="button" class="${i}" data-act="campo" data-g="${a}" data-k="${e}" data-v="${i}" aria-pressed="${n===i}">${V_LBL[i]}</button>`).join("")}
    </div>${t?`<span class="ev">\u201C${esc(t)}\u201D</span>`:""}</div>`}function vVisita(){const a=S.det,e=S.v,s=S.cat;if(!a||!e||!s)return'<div class="empty">Cargando\u2026</div>';const n=new Date().toLocaleDateString("es-PE",{day:"numeric",month:"long",year:"numeric"}),t=`<section class="card slim st-${a.bucket}" aria-label="Datos de la ficha">
    <div class="id"><span class="av">${initials(a.nombre)}</span><div><b>${esc(a.nombre)}</b>
      <span class="mt">Ficha 3 \xB7 Visita N.\xB0 ${a.historial.length+1} \xB7 ${n}</span>
      <span class="mt">DNI ${esc(a.dni)} \xB7 Semana ${a.semana} (trim. ${TRIM[a.trimestre]}) \xB7 Agente: ${esc(S.meta?.agente.split(" (")[0]||"")}</span></div></div>
  </section>`;if(e.fase==="inicio")return`${t}
    <section class="card rec" aria-labelledby="h-rec">
      <h2 id="h-rec">Grabar visita</h2>
      <button class="recbtn" data-act="grabar" aria-label="Empezar a grabar la visita">${ic("mic")}</button>
      <p class="muted">Pida permiso a la gestante antes de grabar. Converse con normalidad: la app llena <b>suplementos, por qu\xE9 no los toma, signos de alarma y h\xE1bitos</b>.</p>
      ${e.error?`<p class="banner st-urgente" role="alert">${ic("alert")}<span>${esc(e.error)}</span></p>`:""}
      <button class="sec" data-act="ejemplo">${ic("play")}Usar audio de ejemplo (demo)</button>
      <button class="ghost" data-act="manual">Llenar sin grabar</button>
    </section>`;if(e.fase==="grabando"){const o=String(Math.floor(e.seg/60)).padStart(2,"0"),u=String(e.seg%60).padStart(2,"0");return`${t}
    <section class="card rec" aria-live="polite">
      <h2>Grabando\u2026</h2>
      <button class="recbtn on" data-act="parar" aria-label="Terminar la grabaci\xF3n y procesar">${ic("stop")}</button>
      <span class="timer" id="timer">${o}:${u}</span>
      <div class="level" aria-hidden="true"><i id="lvl"></i></div>
      <p class="muted">Recuerde preguntar por los suplementos, los signos de alarma y la alimentaci\xF3n.</p>
      <button class="ghost" data-act="cancelar">Cancelar</button>
    </section>`}if(e.fase==="procesando"){const o=(u,h)=>`<li class="${e.paso>u?"ok":e.paso===u?"on":""}">${e.paso>u?ic("check"):e.paso===u?'<span class="spin" aria-hidden="true"></span>':ic("cal")}${h}</li>`;return`${t}<section class="card" aria-live="polite"><h2>Procesando la visita</h2>
      <ol class="steps">${o(1,"Pasando la voz a texto (Whisper)")}${o(2,"Llenando la Ficha 3 con IA")}</ol>
      <p class="muted">El audio se procesa en el servidor de la app y no se guarda.</p></section>`}const r=e.campos,i=Object.values(r.suplementos).some(o=>o.valor==="no"),m=`
    <section class="card">
      <div class="sec-head"><h2>Lo que se registr\xF3</h2></div>
      <div class="cc">${e.fuente==="ia"?`<span class="pill st-ia">${ic("sprout")}Llenado con IA \xB7 revise cada respuesta</span>`:e.fuente==="reglas"?`<span class="pill st-amar">${ic("info")}Llenado por palabras clave \xB7 revise cada respuesta</span>`:""}</div>
      ${e.texto?`<details><summary class="link">${ic("doc")}Ver o corregir la transcripci\xF3n</summary>
        <label class="sr" for="tx">Transcripci\xF3n</label><textarea id="tx">${esc(e.texto)}</textarea>
        <button class="sec" data-act="rellenar">${ic("sprout")}Volver a llenar con este texto</button></details>`:""}
    </section>
    <section class="card" aria-labelledby="h-c9"><h2 id="h-c9">9. Consumo de suplementos</h2>
      ${Object.entries(s.suplementos).map(([o,u],h)=>triHTML("suplementos",o,u,r.suplementos[o].valor,r.suplementos[o].evidencia,!1).replace('class="q"',h?'class="q"':'class="q first"')).join("")}
    </section>
    ${i?`<section class="card" aria-labelledby="h-c10"><h2 id="h-c10">10. \xBFPor qu\xE9 no lo consume?</h2>
      <div class="checks">${Object.entries(s.motivos).map(([o,u])=>`<label><input type="checkbox" data-motivo="${o}" ${r.motivos.includes(o)?"checked":""}>${esc(u)}</label>`).join("")}</div></section>`:""}
    <section class="card" aria-labelledby="h-c11"><h2 id="h-c11">11. Signos de alarma</h2><p class="muted">Si hay alguno, la gestante debe ir hoy al establecimiento de salud.</p>
      ${Object.entries(s.signos).map(([o,u])=>triHTML("signos",o,u,r.signos[o].valor,r.signos[o].evidencia,!0)).join("")}
    </section>
    <section class="card" aria-labelledby="h-c12"><h2 id="h-c12">12-13. H\xE1bitos saludables</h2>
      ${Object.entries(s.habitos).map(([o,u],h)=>triHTML("habitos",o,u,r.habitos[o].valor,r.habitos[o].evidencia,!1).replace('class="q"',h?'class="q"':'class="q first"')).join("")}
    </section>`;if(e.fase==="ficha")return`${t}${m}<button class="big" data-act="mensajes">${ic("msg")}Generar mensajes para la gestante</button>`;const l=e.res;if(!l)return`${t}<section class="card" aria-live="polite"><ol class="steps"><li class="on"><span class="spin"></span>Preparando los mensajes\u2026</li></ol></section>`;const v=l.mensajes.filter(o=>o.origen==="situacion"),c=l.mensajes.filter(o=>o.origen==="trimestre"),d=o=>`<article class="msg${o.origen==="situacion"?" sit":""}"><div class="mh"><h3>${esc(o.titulo)}</h3></div><p class="say">${esc(o.decir)}</p></article>`;return`${t}
    ${l.urgente?`<div class="banner st-urgente" role="alert">${ic("hosp")}<div><b>Referir HOY al establecimiento de salud</b>
      <ul>${l.referencias.map(o=>`<li>${esc(o)}</li>`).join("")}</ul></div></div>`:l.referencias.length?`<div class="banner st-amar">${ic("hosp")}<div><b>Motivos de referencia al EESS</b><ul>${l.referencias.map(o=>`<li>${esc(o)}</li>`).join("")}</ul></div></div>`:""}
    <section class="card" aria-labelledby="h-m"><div class="sec-head"><h2 id="h-m">Qu\xE9 decirle hoy</h2>${l.fuente==="ia"?`<span class="pill st-ia">${ic("sprout")}Redactado con IA</span>`:""}</div>
      ${v.length?`<h3>Por lo que encontraste en la visita</h3>${v.map(d).join("")}`:""}
      ${c.length?`<h3>Por estar en el ${TRIM[l.trimestre]} trimestre (semana ${l.semana})</h3>${c.map(d).join("")}`:""}
    </section>
    <section class="card"><h2>Compromiso</h2><p class="muted">Preg\xFAntele: \u201C${esc(l.cierre)}\u201D</p>
      <div class="field"><label for="comp">QU\xC9 SE COMPROMETE A HACER</label><textarea id="comp" placeholder="Ej.: Tomar el hierro con jugo de naranja despu\xE9s del almuerzo e ir hoy al puesto de salud.">${esc(e.compromiso)}</textarea></div>
    </section>
    <button class="big teal" data-act="guardar">${ic("check")}Guardar visita</button>
    <button class="ghost" data-act="volver-ficha">Volver a la Ficha 3</button>`}function vAyuda(){return`
  <section class="card"><h2>C\xF3mo se arma tu ruta</h2>
    <ul>
      <li><b>Urgentes primero:</b> alertas que avis\xF3 la familia o signos de alarma en la \xFAltima visita.</li>
      <li><b>Visita vencida:</b> la norma pide 2 visitas al mes, cada 13 a 15 d\xEDas. Pasados los 15 d\xEDas sube la prioridad.</li>
      <li><b>Servicios pendientes o en fecha</b> (controles, ex\xE1menes, hierro), <b>no toma suplementos</b>, <b>cerca del parto</b> o <b>gestante adolescente</b> suman puntos.</li>
      <li>Luego la app elige a qui\xE9n visitar seg\xFAn los <b>puntos por minuto de camino</b> y ordena las casas para caminar menos (2-opt), dentro del tiempo que tienes.</li>
    </ul></section>
  <section class="card"><h2>Qu\xE9 graba la Ficha 3</h2>
    <p>Del Formato N.\xB0 03 (RM 241-2024-MINSA), la versi\xF3n Lite llena la parte C: <b>9</b> consumo de suplementos, <b>10</b> por qu\xE9 no los consume, <b>11</b> signos de alarma y <b>12-13</b> h\xE1bitos saludables.</p>
    <p>Con eso y el trimestre, la app elige los <b>mensajes de orientaci\xF3n</b> (parte D) y los <b>motivos de referencia</b> al EESS. Los mensajes se eligen con reglas; la IA solo los redacta en palabras sencillas.</p></section>
  <section class="card"><h2>Privacidad</h2>
    <ul><li>El audio se transcribe en el servidor de la app (Whisper) y no se guarda.</li>
    <li>Pida siempre permiso a la gestante antes de grabar.</li>
    <li>Este demo usa solo <b>datos ficticios</b>: ninguna persona es real.</li></ul></section>
  <section class="card"><h2>Versi\xF3n Lite</h2>
    <p>Incluye gestantes, ruta, mapa y Ficha 3 con voz para un agente. La versi\xF3n completa suma ni\xF1as y ni\xF1os (CRED), modo sin conexi\xF3n, panel del establecimiento (PROMSA) e integraci\xF3n con HIS.</p>
    <button class="sec" data-act="reiniciar">Reiniciar datos del demo</button></section>
  <p class="foot">Puriq Lite \xB7 ${esc(S.meta?.ia?"IA: "+S.meta.modelo_ia:"IA sin configurar: se usan reglas")} \xB7 Whisper ${esc(S.meta?.whisper||"")}</p>`}const main=$("#main"),topEl=$("#top"),nav=$("#nav");let mapa=null,lastView=null;function render(){const a=S.view,e={ficha:S.det?.nombre||"Gestante",visita:"Visita domiciliaria",ayuda:"Ayuda"}[a];topEl.innerHTML=e&&a!=="ayuda"?`<button class="back" data-act="back">${ic("back")}Volver</button><h1>${esc(e)}</h1>`:'<span class="brand"><svg class="logo" viewBox="0 0 64 64" aria-hidden="true"><use href="#i-puriq"/></svg>puriq <span class="lite">LITE</span></span><span class="tag-mock">Datos ficticios</span>',main.innerHTML={inicio:vInicio,ruta:vRuta,gestantes:vGestantes,ficha:vFicha,visita:vVisita,ayuda:vAyuda}[a]();const s=a==="ficha"||a==="visita"?"gestantes":a;nav.innerHTML=[["inicio","home","Inicio"],["ruta","route","Ruta"],["gestantes","users","Gestantes"],["ayuda","info","Ayuda"]].map(([n,t,r])=>`<button data-act="go" data-view="${n}"${s===n?' aria-current="page"':""}>${ic(t)}${r}</button>`).join(""),a==="ruta"&&dibujarMapa(),lastView!==a&&(window.scrollTo(0,0),lastView=a)}function dibujarMapa(){const a=$("#map");if(!a||!S.ruta||typeof L>"u")return;mapa&&(mapa.remove(),mapa=null),mapa=L.map(a,{scrollWheelZoom:!1,zoomControl:!0});const e=S.ruta,s=[[e.inicio.lat,e.inicio.lon],...e.paradas.map(n=>[n.lat,n.lon])];mapa.fitBounds(s.length>1?s:e.geo.casas.features.map(n=>[n.geometry.coordinates[1],n.geometry.coordinates[0]]),{padding:[28,28]}),L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"\xA9 OpenStreetMap"}).addTo(mapa),L.geoJSON(e.geo.ruta,{style:{color:"#1F4E8C",weight:4,dashArray:"8 8",opacity:.85}}).addTo(mapa),e.geo.casas.features.forEach(n=>{const t=n.properties,[r,i]=n.geometry.coordinates,p=NIVEL[t.nivel].color,m=`<b>${esc(t.nombre)}</b><br>${NIVEL[t.nivel].t}${t.orden?` \xB7 parada ${t.orden}`:""}`;t.orden?L.marker([i,r],{icon:L.divIcon({className:"",html:`<span class="mk" style="background:${p}">${t.orden}</span>`,iconSize:[30,30],iconAnchor:[15,15]}),title:t.nombre,zIndexOffset:500}).addTo(mapa).bindPopup(m):L.circleMarker([i,r],{radius:6,color:"#fff",weight:2,fillColor:p,fillOpacity:.9}).addTo(mapa).bindPopup(m)}),L.marker([e.inicio.lat,e.inicio.lon],{icon:L.divIcon({className:"",html:`<span class="mk start">${ic("hosp")}</span>`,iconSize:[30,30],iconAnchor:[15,15]}),title:e.inicio.nombre}).addTo(mapa).bindPopup(`<b>${esc(e.inicio.nombre)}</b><br>Punto de partida`)}async function cargarLista(){[S.lista,S.ruta]=await Promise.all([api("/api/gestantes"),api(`/api/ruta?jornada=${S.jornada}`)])}async function go(a,e={}){Object.assign(S,e);const s=a==="ficha"||a==="visita"?`${a}/${S.pid}`:a;if(location.hash.slice(1)!==s){location.hash=s;return}await route()}async function route(){const[a,e]=location.hash.slice(1).split("/");if(S.view=["inicio","ruta","gestantes","ficha","visita","ayuda"].includes(a)?a:"inicio",(S.view==="ficha"||S.view==="visita")&&e){(S.pid!==e||!S.det)&&(S.pid=e,S.det=null,render());try{S.det=await api(`/api/gestantes/${e}`)}catch(s){toast(s.message),S.view="gestantes"}S.view==="visita"&&(!S.v||S.v.pid!==e)&&(S.v=nuevaVisita(e))}else(S.view==="ficha"||S.view==="visita")&&(S.view="gestantes");render(),main.focus({preventScroll:!0})}let rec=null;async function grabar(){const a=S.v;if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder>"u")return a.error="Este navegador no permite grabar. Use \u201CUsar audio de ejemplo\u201D o \u201CLlenar sin grabar\u201D.",render();try{const e=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:!0,noiseSuppression:!0}}),s=["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/ogg"].find(d=>MediaRecorder.isTypeSupported(d))||"",n=new MediaRecorder(e,s?{mimeType:s}:void 0),t=[];n.ondataavailable=d=>d.data.size&&t.push(d.data);const r=new(window.AudioContext||window.webkitAudioContext),i=r.createAnalyser();i.fftSize=512,r.createMediaStreamSource(e).connect(i);const p=new Uint8Array(i.fftSize);let m;const l=()=>{i.getByteTimeDomainData(p);let d=0;for(const u of p)d=Math.max(d,Math.abs(u-128));const o=$("#lvl");o&&(o.style.width=Math.min(100,d/64*100)+"%"),m=requestAnimationFrame(l)},v=Date.now(),c=setInterval(()=>{a.seg=Math.round((Date.now()-v)/1e3);const d=$("#timer");d&&(d.textContent=`${String(Math.floor(a.seg/60)).padStart(2,"0")}:${String(a.seg%60).padStart(2,"0")}`)},500);rec={mr:n,partes:t,stream:e,ctx:r,stop:()=>{clearInterval(c),cancelAnimationFrame(m),e.getTracks().forEach(d=>d.stop()),r.close()},tipo:s},n.start(1e3),a.fase="grabando",a.seg=0,a.error="",render(),l()}catch{a.error="No se pudo usar el micr\xF3fono. Revise el permiso del navegador.",render()}}function pararGrabacion(a){if(!rec)return;const{mr:e,partes:s,stop:n,tipo:t}=rec;e.onstop=()=>{n(),a&&procesarAudio(new Blob(s,{type:t||"audio/webm"}))},e.stop(),rec=null,a||(S.v.fase="inicio",render())}async function procesarAudio(a){const e=S.v;e.fase="procesando",e.paso=1,render();try{const s=new FormData;s.append("audio",a,a.type.includes("wav")?"visita.wav":"visita.webm");const n=await api("/api/visita/transcribir",{method:"POST",body:s});if(!n.texto||n.texto.length<10)throw new Error("No se entendi\xF3 el audio. Intente grabar m\xE1s cerca.");e.texto=n.texto,e.duracion=n.duracion_audio_s,await llenar()}catch(s){e.fase="inicio",e.error=s.message,render()}}async function llenar(){const a=S.v;a.fase="procesando",a.paso=2,render();try{const e=await api("/api/visita/extraer",{method:"POST",body:JSON.stringify({gestante_id:a.pid,texto:a.texto})});a.campos={suplementos:e.suplementos,motivos:e.motivos||[],signos:e.signos,habitos:e.habitos},a.fuente=e.fuente,a.resumen=e.resumen||"",a.fase="ficha",render()}catch(e){a.fase="inicio",a.error=e.message,render()}}function camposVacios(){const a=e=>Object.fromEntries(Object.keys(e).map(s=>[s,{valor:"nm",evidencia:""}]));return{suplementos:a(S.cat.suplementos),motivos:[],signos:a(S.cat.signos),habitos:a(S.cat.habitos)}}function soloValores(a){const e=s=>Object.fromEntries(Object.entries(s).map(([n,t])=>[n,t.valor]));return{suplementos:e(a.suplementos),motivos:a.motivos,signos:e(a.signos),habitos:e(a.habitos)}}async function generarMensajes(){const a=S.v;a.fase="mensajes",a.res=null,render();try{a.res=await api("/api/visita/mensajes",{method:"POST",body:JSON.stringify({gestante_id:a.pid,campos:soloValores(a.campos),transcripcion:a.texto})})}catch(e){a.fase="ficha",toast(e.message)}render()}async function guardarVisita(){const a=S.v,e=a.res;a.compromiso=$("#comp")?.value||"";try{S.det=await api("/api/visita/guardar",{method:"POST",body:JSON.stringify({gestante_id:a.pid,campos:soloValores(a.campos),urgente:e.urgente,referencias:e.referencias,mensajes:e.mensajes,compromiso:a.compromiso,resumen:a.fuente==="ia"&&a.resumen||e.referencias.join(" \xB7 ")||"Visita realizada sin hallazgos.",duracion_s:a.duracion?Math.round(a.duracion):a.seg||null})}),S.v=null,await cargarLista(),toast(e.urgente?"Visita guardada \xB7 referida al EESS":"Visita guardada"),go("ficha",{pid:S.det.id})}catch(s){toast(s.message)}}let UNDO=null,TT=null;function toast(a,e){const s=$("#toast");UNDO=e||null,s.innerHTML=`${ic("check")}<span>${esc(a)}</span>${e?'<button data-act="undo">Deshacer</button>':""}`,s.hidden=!1,clearTimeout(TT),TT=setTimeout(()=>{s.hidden=!0,UNDO=null},6e3)}document.addEventListener("click",async a=>{const e=a.target.closest("[data-act]");if(!e)return;const s=e.dataset.act,n=S.v;if(s==="go")go(e.dataset.view);else if(s==="back")history.length>1?history.back():go("inicio");else if(s==="open")go("ficha",{pid:e.dataset.id});else if(s==="visita")(!S.v||S.v.pid!==e.dataset.id)&&(S.v=nuevaVisita(e.dataset.id)),go("visita",{pid:e.dataset.id});else if(s==="list")S.filtro=e.dataset.f,go("gestantes");else if(s==="filtro")S.filtro=e.dataset.f,render();else if(s==="jornada")S.jornada=Number(e.dataset.min),S.ruta=await api(`/api/ruta?jornada=${S.jornada}`),render();else if(s==="entregar"){const t=e.dataset.sid,r=S.det.id;S.det=await api(`/api/gestantes/${r}/servicios/${t}`,{method:"POST",body:JSON.stringify({})}),render(),cargarLista(),toast("Servicio registrado como entregado",async()=>{S.det=await api(`/api/gestantes/${r}/servicios/${t}`,{method:"DELETE"}),render(),cargarLista()})}else if(s==="undo")$("#toast").hidden=!0,UNDO&&UNDO();else if(s==="grabar")grabar();else if(s==="parar")pararGrabacion(!0);else if(s==="cancelar")pararGrabacion(!1);else if(s==="ejemplo")try{const t=await api("/api/demo/ejemplo");t.audio?procesarAudio(await(await fetch(t.audio)).blob()):(n.texto=t.texto,llenar())}catch(t){n.error=t.message,render()}else s==="manual"?(n.campos=camposVacios(),n.fuente=null,n.fase="ficha",render()):s==="rellenar"?(n.texto=$("#tx").value,llenar()):s==="campo"?(n.campos[e.dataset.g][e.dataset.k].valor=e.dataset.v,render()):s==="mensajes"?generarMensajes():s==="volver-ficha"?(n.fase="ficha",render()):s==="guardar"?guardarVisita():s==="reiniciar"&&(await api("/api/demo/reiniciar",{method:"POST"}),S.v=null,await cargarLista(),toast("Datos del demo reiniciados"),go("inicio"))}),document.addEventListener("change",a=>{const e=a.target.dataset?.motivo;if(e&&S.v?.campos){const s=S.v.campos.motivos;S.v.campos.motivos=a.target.checked?[...new Set([...s,e])]:s.filter(n=>n!==e)}}),document.addEventListener("input",a=>{if(a.target.id==="q"){S.q=a.target.value;const e=a.target.selectionStart;render();const s=$("#q");s.focus(),s.setSelectionRange(e,e)}a.target.id==="comp"&&S.v&&(S.v.compromiso=a.target.value)}),window.addEventListener("hashchange",route),async function(){try{[S.meta,S.cat]=await Promise.all([api("/api/estado"),api("/api/ficha3/catalogo")]),await cargarLista()}catch(e){main.innerHTML=`<div class="empty">No se pudo conectar con el servidor. ${esc(e.message)}</div>`;return}route()}();
