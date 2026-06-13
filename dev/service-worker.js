const CACHE_NAME = 'tpc-dev-portal-v2';
const urlsToCache = [
    './',
    './index.html',
    './css/style.css',
    './js/front_page_lock.js',
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
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                if (response) {
                    return response;
                }
                return fetch(event.request);
            })
    );
});
