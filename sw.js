/* Atomic app shell, scoped cache, opt-in activation of updates. */
const VERSION = '1.8.4';
const PREFIX = `nfc-reader:${self.registration.scope}:`;
const CACHE = `${PREFIX}${VERSION}`;
const v = file => `${file}?v=${VERSION}`;
const RESOURCES = [
  './', './index.html', v('./manifest.webmanifest'),
  v('./assets/css/style.css'), v('./assets/js/app.mjs'), v('./assets/js/core.mjs'),
  v('./assets/js/sound.mjs'), v('./assets/vendor/vue.global.js'),
  v('./assets/icons/favicon.svg'), './assets/icons/icon-192.png',
  './assets/icons/icon-512.png', './assets/icons/icon-maskable-512.png',
];
self.addEventListener('install', event => {
  // A failed precache leaves the previous working version intact.
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(
    RESOURCES.map(path => new Request(new URL(path, self.registration.scope), {cache: 'reload'}))
  )));
  // Do NOT skipWaiting here: a new version must not interrupt a scan.
});
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Do not erase caches belonging to another app/repository on this origin.
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (request.mode === 'navigate' && (url.pathname === scope.pathname || url.pathname === `${scope.pathname}index.html`)) {
      // HTML and versioned assets come from the same installed release.
      return await cache.match(new URL('./index.html', scope)) || fetch(request);
    }
    return await cache.match(request) || fetch(request);
  })());
});
