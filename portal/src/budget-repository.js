import { emptyLedger, validateEntry, validateLedger } from './budget-model.js';

// Injected object storage makes conflict/retry behavior testable without AWS.
export function createBudgetRepository({ read, write }) {
  async function load() {
    const stored = await read();
    return stored ? { ledger: validateLedger(stored.ledger), etag: stored.etag } : { ledger: emptyLedger(), etag: null };
  }
  async function commit(change) {
    if (change.entry) {
      validateEntry(change.entry);
      if (change.entry.id !== change.id) throw new Error('Entry identifiers do not match.');
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      const { ledger, etag } = await load();
      const current = ledger.entries.find(e => e.id === change.id);
      // The same mutation can be retried after a lost success response.
      if (change.entry && current?.revision === change.entry.revision) return ledger;
      if (!change.entry && !current) return ledger;
      if ((current?.revision ?? null) !== change.expectedRevision) {
        throw new Error('This entry changed on another device. Refresh and open it again before editing. Your input is still here.');
      }
      const entries = ledger.entries.filter(e => e.id !== change.id);
      if (change.entry) entries.push(change.entry);
      const next = validateLedger({ version: 1, entries });
      try { await write(next, etag); return next; }
      catch (error) {
        if (![409, 412].includes(error.$metadata?.httpStatusCode) || attempt === 2) throw error;
        // Merge independent changes after a conditional-write race; never overwrite a stale edit.
      }
    }
  }
  return { load: async () => (await load()).ledger, commit };
}
