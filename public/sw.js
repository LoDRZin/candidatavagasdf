const CACHE = 'conectavagasdf-public-v3';
const CORE = ['/', '/offline.html', '/manifest.webmanifest', '/icons/conectavagasdf.svg', '/icons/conectavagasdf-maskable.svg'];
const SAFE_OFFLINE_ROUTES = new Set(['/', '/privacidade', '/termos']);
const STATIC_DESTINATIONS = new Set(['script', 'style', 'font', 'image', 'manifest']);
const MAX_STATIC_ENTRIES = 40;

async function trimCache(cache) {
  const keys = await cache.keys();
  const removable = keys.filter(request => !CORE.includes(new URL(request.url).pathname));
  await Promise.all(removable.slice(0, Math.max(0, keys.length - MAX_STATIC_ENTRIES)).map(request => cache.delete(request)));
}

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok && SAFE_OFFLINE_ROUTES.has(url.pathname)) {
          const cache = await caches.open(CACHE);
          await cache.put('/', response.clone());
        }
        return response;
      } catch {
        if (SAFE_OFFLINE_ROUTES.has(url.pathname)) return (await caches.match('/')) || (await caches.match('/offline.html'));
        return (await caches.match('/offline.html')) || Response.error();
      }
    })());
    return;
  }

  if (!STATIC_DESTINATIONS.has(request.destination) && !CORE.includes(url.pathname)) return;
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(request, response.clone());
      await trimCache(cache);
    }
    return response;
  })());
});
