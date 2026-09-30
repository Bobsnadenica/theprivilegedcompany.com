import { validateState } from './model.js';

// Whole-save optimistic concurrency: a different device's adventure is never
// silently replaced. The user can compare/export both copies before choosing.
export function createCloudRepository(adapter) {
  let etag = null, loaded = false;
  return {
    async load() {
      const stored = await adapter.read();
      if (stored && !stored.etag) throw new Error('missingVersion');
      const state = stored ? validateState(stored.ledger) : null;
      etag = stored?.etag || null; loaded = true;
      return state;
    },
    async save(state) {
      validateState(state);
      if (!loaded) throw new Error('missingVersion');
      try {
        const nextEtag = await adapter.write(state, etag);
        if (nextEtag) { etag = nextEtag; return; }
      } catch (error) {
        // A server may have committed a write even if its reply was lost.
        // An SDK retry of that write can then receive a 412 for our own revision.
        const stored = await adapter.read().catch(() => null);
        if (stored?.etag && stored.ledger?.revision === state.revision) { etag = stored.etag; return; }
        if ([409, 412].includes(error.$metadata?.httpStatusCode)) throw new Error('cloudConflict');
        throw error;
      }
      const stored = await adapter.read();
      if (!stored?.etag || stored.ledger?.revision !== state.revision) throw new Error('cloudConflict');
      etag = stored.etag;
    },
    async remove() { await adapter.remove(); etag = null; loaded = true; },
  };
}
