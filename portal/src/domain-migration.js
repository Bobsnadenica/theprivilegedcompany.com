import { isDomain, validateTimers } from './timeto-model.js';

// Overrides contain record IDs and terms from private account data, never titles.
// The source is not mutated; upload the result with the source object's ETag.
export function migrateDomainTerms(source, overrides = {}, revision = () => crypto.randomUUID()) {
  validateTimers(source);
  const domains = new Set(source.entries.filter(isDomain).map(e => e.id));
  for (const [id, years] of Object.entries(overrides)) {
    if (!domains.has(id) || !Number.isInteger(years) || years < 1 || years > 10) throw new Error('Each override must identify an existing domain and a term from 1 to 10 years.');
  }
  return validateTimers({ ...structuredClone(source), entries: source.entries.map(entry => {
    if (!isDomain(entry)) return structuredClone(entry);
    const termYears = overrides[entry.id] ?? entry.termYears ?? 1;
    return { ...structuredClone(entry), kind: 'domain', termYears,
      revision: entry.kind === 'domain' && entry.termYears === termYears ? entry.revision : revision() };
  }) });
}
