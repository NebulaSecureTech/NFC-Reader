/* Service Worker: risorse locali, utilizzabile in qualunque sottocartella GitHub Pages. */
const CACHE = 'nfc-reader-v1.1.0';
const RESOURCES = [
  './', './index.html', './manifest.webmanifest',
  './assets/css/style.css', './assets/js/app.mjs',
  './assets/js/core.mjs', './assets/js/sound.mjs',
  './assets/vendor/vue.global.js', './assets/icons/favicon.svg',
  './assets/icons/icon-192.png', './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(RESOURCES)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('nfc-reader-') && key !== CACHE).map(key => caches.delete(key)))),
    self.clients.claim()
  ]));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  // Per la pagina principale prova la rete, poi torna alla versione offline.
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('./index.html')));
    return;
  }
  // Il resto del pacchetto e' versionato: nessun asset esterno richiesto.
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
