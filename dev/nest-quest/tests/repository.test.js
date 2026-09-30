import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudRepository } from '../src/repository.js';
import { demoState, uuid } from '../src/model.js';
function fixture() {
  let stored = null, count = 0;
  return {
    async read() { return stored ? structuredClone(stored) : null; },
    async write(state, etag) {
      if ((stored?.etag || null) !== etag) throw Object.assign(new Error('race'), { $metadata: { httpStatusCode: 412 } });
      stored = { ledger: structuredClone(state), etag: `"${++count}"` }; return stored.etag;
    },
    async remove() { stored = null; },
    get stored() { return structuredClone(stored); },
  };
}
test('new saves require a prior read and conditional creation', async () => {
  const adapter = fixture(), repository = createCloudRepository(adapter), state = demoState('2026-09-30');
  await assert.rejects(repository.save(state), /missingVersion/);
  assert.equal(await repository.load(), null); await repository.save(state);
  assert.equal(adapter.stored.ledger.revision, state.revision);
});
test('two devices cannot silently overwrite each other', async () => {
  const adapter = fixture(), a = createCloudRepository(adapter), b = createCloudRepository(adapter);
  await a.load(); await b.load(); const first = demoState('2026-09-30'); await a.save(first);
  const second = demoState('2026-09-30'); second.profile.name = 'Other device';
  await assert.rejects(b.save(second), /cloudConflict/);
  assert.equal(adapter.stored.ledger.profile.name, 'Ember');
  await b.load(); await b.save(second); assert.equal(adapter.stored.ledger.profile.name, 'Other device');
  await assert.rejects(a.save(first), /cloudConflict/);
});
test('a lost success reply is recovered by matching the exact revision', async () => {
  const adapter = fixture(), baseWrite = adapter.write;
  adapter.write = async (state, etag) => { await baseWrite(state, etag); throw new Error('network'); };
  const repository = createCloudRepository(adapter); await repository.load();
  const state = demoState('2026-09-30'); await repository.save(state);
  adapter.write = baseWrite; state.revision = uuid(); await repository.save(state);
  assert.equal(adapter.stored.ledger.revision, state.revision);
});
test('unknown reads fail closed and cannot be treated as an empty save', async () => {
  const repository = createCloudRepository({ read: async () => { throw new Error('AccessDenied'); }, write: async () => assert.fail('No writes allowed') });
  await assert.rejects(repository.load(), /AccessDenied/); await assert.rejects(repository.save(demoState('2026-09-30')), /missingVersion/);
});
test('an SDK retry returning 412 after a lost success still recognizes its own revision', async () => {
  const adapter = fixture(), baseWrite = adapter.write;
  adapter.write = async (state, etag) => {
    await baseWrite(state, etag);
    throw Object.assign(new Error('retried after lost response'), { $metadata: { httpStatusCode: 412 } });
  };
  const repository = createCloudRepository(adapter); await repository.load();
  await repository.save(demoState('2026-09-30'));
  assert.ok(adapter.stored);
});
test('invalid remote JSON and missing ETags do not enable saving', async () => {
  for (const stored of [{ etag: '"1"', ledger: { version: 99 } }, { ledger: demoState('2026-09-30') }]) {
    const repository = createCloudRepository({ read: async () => stored, write: async () => assert.fail('No writes allowed') });
    await assert.rejects(repository.load()); await assert.rejects(repository.save(demoState('2026-09-30')), /missingVersion/);
  }
});
test('a failed write preserves the remote copy', async () => {
  const adapter = fixture(), repository = createCloudRepository(adapter); await repository.load();
  const saved = demoState('2026-09-30'); await repository.save(saved);
  adapter.write = async () => { throw new Error('offline'); };
  const next = structuredClone(saved); next.revision = uuid(); next.profile.name = 'Unsaved';
  await assert.rejects(repository.save(next), /offline/); assert.equal(adapter.stored.ledger.profile.name, 'Ember');
});
test('a write without an ETag is verified before accepting it', async () => {
  const adapter = fixture(), baseWrite = adapter.write;
  adapter.write = async (state, etag) => { await baseWrite(state, etag); };
  const repository = createCloudRepository(adapter); await repository.load();
  const s = demoState('2026-09-30'); await repository.save(s); s.revision = uuid(); await repository.save(s);
  assert.equal(adapter.stored.ledger.revision, s.revision);
});
test('removing the current save supports a future conditional creation', async () => {
  const adapter = fixture(), repository = createCloudRepository(adapter); await repository.load();
  await repository.save(demoState('2026-09-30')); await repository.remove(); assert.equal(adapter.stored, null);
  await repository.save(demoState('2026-09-30')); assert.ok(adapter.stored);
});
