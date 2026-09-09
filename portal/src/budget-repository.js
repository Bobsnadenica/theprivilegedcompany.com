import { emptyLedger, validateEntry, validateLedger } from './budget-model.js';

// Injected object storage makes conflict/retry behavior testable without AWS.
export function createBudgetRepository({ read, write }, validators = {}, { now = Date.now } = {}) {
  const checkEntry = validators.entry || validateEntry;
  const checkLedger = validators.ledger || validateLedger;
  let cached = null, cachedAt = 0, pendingRead = null, generation = 0;
  function clear() { generation++; cached = null; pendingRead = null; }
  function remember(ledger) { cached = structuredClone(ledger); cachedAt = now(); return ledger; }
  async function load() {
    const stored = await read();
    return stored ? { ledger: checkLedger(stored.ledger), etag: stored.etag } : { ledger: emptyLedger(), etag: null };
  }
  async function commit(change) {
    // Cached reads are for display only. Every mutation still reads S3 and its ETag.
    clear();
    const mutationGeneration = generation;
    const confirmed = ledger => {
      // A late display read cannot replace a confirmed write. A cleared session
      // cannot be repopulated by an in-flight mutation finishing after logout.
      if (generation === mutationGeneration) { clear(); remember(ledger); }
      return ledger;
    };
    if (change.entry) {
      checkEntry(change.entry);
      if (change.entry.id !== change.id) throw new Error('Entry identifiers do not match.');
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      const { ledger, etag } = await load();
      if (change.removeCategory) {
        const { type, name } = change.removeCategory;
        if (!['income', 'expense'].includes(type) || typeof name !== 'string' || !name || name.length > 48 || name === 'Other') throw new Error('This category cannot be deleted.');
        const removed = ledger.removedCategories || [];
        const next = checkLedger({ ...ledger,
          removedCategories: [...removed.filter(c => c.type !== type || c.name !== name), {type, name}],
          entries: ledger.entries.map(e => e.type === type && e.category === name ? {...e, category: 'Other', revision: change.revision} : e)
        });
        try { await write(next, etag); return confirmed(next); }
        catch (error) { if (![409, 412].includes(error.$metadata?.httpStatusCode) || attempt === 2) throw error; continue; }
      }
      if (change.entry && (ledger.removedCategories || []).some(c => c.type === change.entry.type && c.name === change.entry.category)) throw new Error('This category was deleted. Choose another category.');
      const current = ledger.entries.find(e => e.id === change.id);
      // The same mutation can be retried after a lost success response.
      if (change.entry && current?.revision === change.entry.revision) return confirmed(ledger);
      if (!change.entry && !current) return confirmed(ledger);
      if ((current?.revision ?? null) !== change.expectedRevision) {
        throw new Error('This entry changed on another device. Refresh and open it again before editing. Your input is still here.');
      }
      const entries = ledger.entries.filter(e => e.id !== change.id);
      if (change.entry) entries.push(change.entry);
      const next = checkLedger({ ...ledger, entries });
      try { await write(next, etag); return confirmed(next); }
      catch (error) {
        if (![409, 412].includes(error.$metadata?.httpStatusCode) || attempt === 2) throw error;
        // Merge independent changes after a conditional-write race; never overwrite a stale edit.
      }
    }
  }
  return {
    clear, commit,
    async load({ force = false } = {}) {
      if (!force && cached && now() - cachedAt < 60000) return structuredClone(cached);
      if (pendingRead) return structuredClone(await pendingRead);
      const started = generation;
      const request = load().then(({ ledger }) => {
        if (generation === started) remember(ledger);
        return ledger;
      });
      pendingRead = request;
      try { return structuredClone(await request); }
      finally { if (pendingRead === request) pendingRead = null; }
    },
  };
}
