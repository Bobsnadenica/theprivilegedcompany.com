const CACHE_NAME = 'tpc-dev-portal-v8';
const shell = ['./', './index.html', './css/style.css', './js/front_page_map.js', './js/explosion.js', './manifest.json', '../apple-touch-icon.png'];
const allowed = new Set(shell.map(path => new URL(path, self.registration.scope).href));
self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll([...allowed])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
    event.waitUntil(caches.keys().then(names => Promise.all(names.filter(name => name.startsWith('tpc-dev-portal-') && name !== CACHE_NAME).map(name => caches.delete(name)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;
    const url = new URL(event.request.url);
    url.search = ''; url.hash = '';
    // This worker controls /dev/, but owns only the hub. Never serve another app's cache.
    if (!allowed.has(url.href)) return;
    event.respondWith((async () => {
        const cache = await caches.open(CACHE_NAME).catch(() => null);
        try {
            const response = await fetch(event.request);
            if (cache && response.ok && response.type !== 'opaque') {
                event.waitUntil(cache.put(url.href, response.clone()).catch(() => {}));
            }
            return response;
        } catch {
            return (cache && await cache.match(url.href).catch(() => null)) || new Response('This page is unavailable offline. Please reconnect.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
        }
    })());
});
