// Puriq: funciona sin señal.
// - App (HTML, JS, CSS) y datos de la API: primero la red; sin señal, lo último guardado.
// - Mapa, fuentes y Leaflet (otros sitios): primero lo guardado.
// Los envíos (POST) no pasan por aquí: si no hay señal, la app los guarda y los manda después.
const V = "puriq-v2";
const PROPIOS = ["./", "index.html", "app.js", "styles.css", "favicon.svg"];
const EXTERNOS = ["https://unpkg.com/leaflet@1.9.4/dist/leaflet.css", "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(V);
    await c.addAll(PROPIOS);
    await Promise.all(EXTERNOS.map((u) => c.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== V) await caches.delete(k);
    await self.clients.claim();
  })());
});

const guardar = (req, r) => { const copia = r.clone(); caches.open(V).then((c) => c.put(req, copia)); return r; };

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.pathname.startsWith("/api/demo/audio")) return;

  if (url.origin === self.location.origin) {
    const ruta = url.pathname === "/api/ruta"; // cambia la hora en la URL: sin señal usar la última ruta
    e.respondWith(
      fetch(req).then((r) => (r.ok ? guardar(req, r) : r)).catch(async () =>
        (await caches.match(req, { ignoreSearch: ruta })) ||
        (req.mode === "navigate" && (await caches.match("index.html"))) ||
        new Response(JSON.stringify({ detail: "Sin señal" }), { status: 503, headers: { "Content-Type": "application/json" } }))
    );
    return;
  }
  e.respondWith(caches.match(req).then((c) => c || fetch(req).then((r) => (r.ok || r.type === "opaque" ? guardar(req, r) : r))));
});
