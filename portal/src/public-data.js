// Only bundled, public geography/catalogue responses enter CacheStorage.
// Private account ledgers continue to use no-store and repository memory caches.
export async function loadPublicJson(url, cacheName, validate, { storage = globalThis.caches, fetcher = globalThis.fetch } = {}) {
  let cache;
  try {
    cache = await storage?.open(cacheName);
    const stored = await cache?.match(url);
    if (stored) {
      try { return validate(await stored.json()); }
      catch { await cache.delete(url); }
    }
  } catch { cache = null; }
  const response = await fetcher(url, { credentials: 'omit' });
  if (!response.ok) throw new Error('Could not load the public explorer data. Please retry.');
  const data = validate(await response.clone().json());
  try {
    if (cache) {
      await cache.put(url, response);
      for (const key of await cache.keys()) if (key.url !== new URL(url, globalThis.location?.href).href) await cache.delete(key);
    }
  } catch { /* Browsing remains available if storage is full or disabled. */ }
  return data;
}
