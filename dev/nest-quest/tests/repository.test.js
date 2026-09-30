import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudRepository } from '../src/repository.js';
import { demoState, uuid } from '../src/model.js';
function fixture(initial = null) {
  let stored = initial ? structuredClone(initial) : null, count = 0;
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
test('legacy cloud load migrates losslessly and preserves its ETag until an explicit goal write', async () => {
  const legacy = demoState('2026-09-30'); legacy.version = 1; delete legacy.goal;
  const original = structuredClone(legacy);
  const adapter = fixture({ ledger: legacy, etag: '"legacy-version"' });
  const write = adapter.write, conditions = [];
  adapter.write = async (state, etag) => { conditions.push(etag); return write(state, etag); };
  const repository = createCloudRepository(adapter), loaded = await repository.load();
  assert.equal(loaded.version, 2); assert.equal(loaded.goal, null);
  assert.equal(loaded.revision, original.revision);
  const { version, goal, ...preserved } = loaded, { version: originalVersion, ...expected } = original;
  assert.deepEqual(preserved, expected);
  assert.deepEqual(adapter.stored, { ledger: original, etag: '"legacy-version"' }, 'Reading never rewrites the cloud object');
  loaded.goal = { id: uuid(), kind: 'house', title: 'Our first home', target: 10000000, opening: 425000 };
  loaded.revision = uuid();
  await repository.save(loaded);
  assert.deepEqual(conditions, ['"legacy-version"']);
  assert.equal(adapter.stored.ledger.version, 2);
  assert.deepEqual(adapter.stored.ledger.goal, loaded.goal);
  assert.deepEqual(adapter.stored.ledger.entries, original.entries);
  assert.deepEqual(adapter.stored.ledger.claims, original.claims);
});
test('version 2 cloud writes retain a custom goal, opening money, and ledger across reloads', async () => {
  const adapter = fixture(), first = createCloudRepository(adapter), state = demoState('2026-09-30');
  state.goal = { id: uuid(), kind: 'custom', title: 'Studio equipment', target: 1234567, opening: 345678 };
  await first.load(); await first.save(state);
  const second = createCloudRepository(adapter), loaded = await second.load();
  assert.deepEqual(loaded, state);
  loaded.goal.target = 2345678; loaded.revision = uuid();
  await second.save(loaded);
  assert.equal(loaded.goal.opening, 345678);
  assert.deepEqual((await createCloudRepository(adapter).load()).goal, loaded.goal);
  assert.deepEqual(adapter.stored.ledger.entries, state.entries);
});
test('a concurrent goal conflict preserves the cloud goal and the unsaved device goal', async () => {
  const adapter = fixture(), seed = createCloudRepository(adapter), state = demoState('2026-09-30');
  await seed.load(); await seed.save(state);
  const first = createCloudRepository(adapter), second = createCloudRepository(adapter);
  const cloudChange = await first.load(), deviceChange = await second.load();
  cloudChange.goal.opening = 810000; cloudChange.revision = uuid();
  await first.save(cloudChange);
  deviceChange.goal = { id: uuid(), kind: 'wedding', title: 'Our wedding', target: 5000000, opening: 730000 };
  deviceChange.revision = uuid();
  const unsavedGoal = structuredClone(deviceChange.goal);
  await assert.rejects(second.save(deviceChange), /cloudConflict/);
  assert.deepEqual(adapter.stored.ledger.goal, cloudChange.goal);
  assert.deepEqual(deviceChange.goal, unsavedGoal, 'Conflict leaves the device choice available for backup or retry');
  assert.deepEqual((await createCloudRepository(adapter).load()).goal, cloudChange.goal);
});
