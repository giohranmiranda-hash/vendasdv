/* ICE SISTEMA — service worker.
   Estratégia: network-first pro HTML (nunca ficar preso numa versão velha),
   cache-first com atualização em segundo plano pros demais arquivos.
   IMPORTANTE: dar bump em CACHE_VERSION a cada deploy relevante. */
const CACHE_VERSION = "ice-v3";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/app.css",
  "./js/config.js",
  "./js/util.js",
  "./js/store.js",
  "./js/engine.js",
  "./js/charts.js",
  "./js/ui.js",
  "./js/cloud.js",
  "./js/geo.js",
  "./js/app.js",
  "./js/views-dashboard.js",
  "./js/views-vendas.js",
  "./js/views-crm.js",
  "./js/views-producao.js",
  "./js/views-insumos.js",
  "./js/views-receitas.js",
  "./js/views-mapa.js",
  "./js/views-assistente.js",
  "./js/views-financeiro.js",
  "./js/views-extras.js",
  "./js/views-assinatura.js",
  "./js/views-config.js",
  "./vendor/leaflet/leaflet.js",
  "./vendor/leaflet/leaflet.css",
  "./vendor/leaflet/images/marker-icon.png",
  "./vendor/leaflet/images/marker-icon-2x.png",
  "./vendor/leaflet/images/marker-shadow.png",
  "./icons/icon.svg",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  // APIs externas (Supabase, geocodificadores, tiles, Gemini) nunca passam pelo cache
  if (url.origin !== location.origin) return;

  const isHtml = e.request.mode === "navigate" || url.pathname.endsWith(".html") || url.pathname.endsWith("/");
  if (isHtml) {
    // network-first: sempre tenta a versão nova, cai pro cache offline
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request).then((r) => r || caches.match("./index.html")))
    );
    return;
  }

  // cache-first + atualização em segundo plano (stale-while-revalidate)
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const update = fetch(e.request)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || update;
    })
  );
});
