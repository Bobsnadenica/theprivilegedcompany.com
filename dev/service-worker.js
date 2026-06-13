const CACHE_NAME = 'tpc-dev-portal-v4';
const urlsToCache = [
    './',
    './index.html',
    './css/style.css',
    './js/front_page_map.js',
    './js/explosion.js',
    './manifest.json',
    './icons/apple-touch-icon.png',
    './converter/index.html',
    './games/index.html',
    './iveto/index.html',
    './conspiracy/index.html',
    './whoami/whoami.html',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Opened cache');
                return cache.addAll(urlsToCache);
            })
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => Promise.all(
                cacheNames
                    .filter((cacheName) => cacheName !== CACHE_NAME)
                    .map((cacheName) => caches.delete(cacheName))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    if (request.mode === 'navigate' || request.destination === 'document') {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const copy = response.clone();
                    caches.open(CACHE_NAME)
                        .then((cache) => cache.put(request, copy));
                    return response;
                })
                .catch(() => caches.match(request)
                    .then((response) => response || caches.match('./index.html')))
        );
        return;
    }

    event.respondWith(
        caches.match(request)
            .then((response) => {
                if (response) {
                    return response;
                }
                return fetch(request);
            })
    );
});
