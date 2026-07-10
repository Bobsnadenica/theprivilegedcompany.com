const CACHE_NAME = 'mist-of-atlas-v9';
const CORE_ASSETS = [
  './',
  './index.html',
  './styles.css?v=20260710a',
  './script.js?v=20260710a',
  './icon.png',
  './manifest.json?v=20260710b',
  './privacy.html',
  './terms.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      const freshRequests = CORE_ASSETS.map((asset) => new Request(asset, { cache: 'reload' }));
      return cache.addAll(freshRequests);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }

          return response;
        })
        .catch(() => caches.match(request).then((response) => response || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const networkResponse = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }

          return response;
        })
        .catch(() => cachedResponse);

      return cachedResponse || networkResponse;
    })
  );
});
