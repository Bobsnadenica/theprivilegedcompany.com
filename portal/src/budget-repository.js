import { emptyLedger, validateEntry, validateLedger } from './budget-model.js';

// Injected object storage makes conflict/retry behavior testable without AWS.
export function createBudgetRepository({ read, write }, validators = {}) {
  const checkEntry = validators.entry || validateEntry;
  const checkLedger = validators.ledger || validateLedger;
  async function load() {
    const stored = await read();
    return stored ? { ledger: checkLedger(stored.ledger), etag: stored.etag } : { ledger: emptyLedger(), etag: null };
  }
  async function commit(change) {
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
        try { await write(next, etag); return next; }
        catch (error) { if (![409, 412].includes(error.$metadata?.httpStatusCode) || attempt === 2) throw error; continue; }
      }
      if (change.entry && (ledger.removedCategories || []).some(c => c.type === change.entry.type && c.name === change.entry.category)) throw new Error('This category was deleted. Choose another category.');
      const current = ledger.entries.find(e => e.id === change.id);
      // The same mutation can be retried after a lost success response.
      if (change.entry && current?.revision === change.entry.revision) return ledger;
      if (!change.entry && !current) return ledger;
      if ((current?.revision ?? null) !== change.expectedRevision) {
        throw new Error('This entry changed on another device. Refresh and open it again before editing. Your input is still here.');
      }
      const entries = ledger.entries.filter(e => e.id !== change.id);
      if (change.entry) entries.push(change.entry);
      const next = checkLedger({ ...ledger, entries });
      try { await write(next, etag); return next; }
      catch (error) {
        if (![409, 412].includes(error.$metadata?.httpStatusCode) || attempt === 2) throw error;
        // Merge independent changes after a conditional-write race; never overwrite a stale edit.
      }
    }
  }
  return { load: async () => (await load()).ledger, commit };
}
