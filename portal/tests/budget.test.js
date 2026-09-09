import test from 'node:test';
import assert from 'node:assert/strict';
import { categoryColors, parseAmount, summarize, validDate, validateLedger, localDate, csv, categoriesFor } from '../src/budget-model.js';
import { createBudgetRepository } from '../src/budget-repository.js';
import { budgetStorageAdapter } from '../src/budget-storage.js';
const entry = (extra = {}) => ({ id: 'entry-1', revision: 'rev-1', type: 'expense', category: 'Food', currency: 'EUR', amount: 1234, date: '2026-09-09', note: '', ...extra });
const change = (e, expectedRevision = null) => ({ id: e.id, entry: e, expectedRevision });
const ledger = entries => ({ version: 1, entries });
function memoryStore(entries = []) {
  let value = ledger(entries), version = 1;
  return { read: async () => ({ ledger: structuredClone(value), etag: String(version) }), write: async (next, etag) => {
    if (etag !== String(version)) throw { $metadata: { httpStatusCode: 412 } };
    value = structuredClone(next);version++;
  }, peek: () => value };
}

test('decimal amounts are exact cents, including a phone decimal comma', () => {
  assert.equal(parseAmount('0.10') + parseAmount('0,20'), 30);
  assert.equal(parseAmount(' 1234,5 '), 123450);
  assert.equal(parseAmount('999999999.99'), 99999999999);
  for (const value of ['0', '-5', '1.234', '1e3', 'NaN', '1,200.00', '', '1000000000']) assert.throws(() => parseAmount(value));
});
test('dates reject rollover and preserve a local calendar date', () => {
  assert.equal(validDate('2024-02-29'), true);
  for(const date of ['2026-02-29', '2026-04-31', '2026-13-01', 'nonsense']) assert.equal(validDate(date), false);
  assert.equal(localDate(new Date(2026, 0, 2, 0, 1)), '2026-01-02');
});
test('monthly totals, negative balance and category groups never mix currencies', () => {
  const entries = [entry({amount:10}), entry({id:'two',amount:20}), entry({id:'three',type:'income',category:'Salary',amount:25}), entry({id:'four',currency:'USD',amount:999}), entry({id:'five',date:'2026-08-31',amount:100})];
  const sum = summarize(entries,'2026-09','EUR');
  assert.deepEqual([sum.income,sum.expense,sum.balance],[25,30,-5]);
  assert.deepEqual(sum.groups.expense,[['Food',30]]);
  assert.equal(summarize(entries,'','EUR').expense,130);
  assert.equal(summarize(entries,'2026-10','EUR').entries.length,0);
  assert.equal(summarize(entries,'2026-09','USD').expense,999);
});
test('custom categories are available only for their transaction type', () => {
  assert(categoriesFor([entry({category:'My pet'})],'expense').includes('My pet'));
  assert(!categoriesFor([entry({category:'My pet'})],'income').includes('My pet'));
});
test('ledger validates versions, amounts, currencies and duplicate IDs before writes', () => {
  assert.throws(()=>validateLedger({version:2,entries:[]}));
  for(const extra of [{amount:-1},{amount:1.2},{currency:'BTC'},{category:''},{date:'2026-02-30'}]) assert.throws(()=>validateLedger(ledger([entry(extra)])));
  assert.throws(()=>validateLedger(ledger([entry(),entry()])));
});
test('two devices adding independent entries merge after a conditional conflict', async () => {
  const store=memoryStore();const a=createBudgetRepository(store),b=createBudgetRepository(store);
  await Promise.all([a.commit(change(entry())),b.commit(change(entry({id:'entry-2'})))]);
  assert.equal(store.peek().entries.length,2);
});
test('a stale edit cannot overwrite the other device', async () => {
  const store=memoryStore([entry()]);const repo=createBudgetRepository(store);
  await repo.commit(change(entry({revision:'rev-2',amount:500}),'rev-1'));
  await assert.rejects(repo.commit(change(entry({revision:'rev-3',amount:900}),'rev-1')),/another device/);
  assert.equal(store.peek().entries[0].amount,500);
});
test('stale delete cannot delete an edited entry', async () => {
  const store=memoryStore([entry({revision:'rev-2'})]);
  await assert.rejects(createBudgetRepository(store).commit({id:'entry-1',entry:null,expectedRevision:'rev-1'}),/another device/);
  assert.equal(store.peek().entries.length,1);
});
test('retry after a lost successful response is idempotent', async () => {
  const store=memoryStore();let fail=true;
  const repo=createBudgetRepository({read:store.read,write:async(...args)=>{await store.write(...args);if(fail){fail=false;throw new Error('network');}}});
  const mutation=change(entry());await assert.rejects(repo.commit(mutation),/network/);
  await repo.commit(mutation);assert.equal(store.peek().entries.length,1);
});
test('corrupt/denied reads never become an empty ledger write', async () => {
  let writes=0;
  for(const read of [async()=>{throw new Error('AccessDenied');},async()=>({ledger:{version:99},etag:'x'})]) {
    const repo=createBudgetRepository({read,write:async()=>writes++});
    await assert.rejects(repo.commit(change(entry())));
  }
  assert.equal(writes,0);
});
test('create, edit and delete round trip, including already-deleted retry', async () => {
  const store=memoryStore();const repo=createBudgetRepository(store);
  await repo.commit(change(entry()));await repo.commit(change(entry({revision:'rev-2',amount:456}),'rev-1'));
  assert.equal((await repo.load()).entries[0].amount,456);
  const deletion={id:'entry-1',entry:null,expectedRevision:'rev-2'};
  await repo.commit(deletion);await repo.commit(deletion);assert.deepEqual((await repo.load()).entries,[]);
});
test('S3 adapter binds user key and conditional headers, hides no read errors except NoSuchKey', async () => {
  const calls=[];const client={send:async command=>{calls.push(command.input);return {ETag:'"v1"',Body:{transformToString:async()=>JSON.stringify(ledger([]))}};}};
  const adapter=budgetStorageAdapter(client,'bucket','users/a@example.com/.budget/ledger-v1.json');
  assert.equal((await adapter.read()).etag,'"v1"');
  await adapter.write(ledger([]),null);await adapter.write(ledger([entry()]),'"v1"');
  assert.equal(calls[1].IfNoneMatch,'*');assert.equal(calls[2].IfMatch,'"v1"');assert.equal(calls[2].CacheControl,'no-store');
  assert(calls.every(c=>c.Key==='users/a@example.com/.budget/ledger-v1.json'));
  for (const name of ['NoSuchKey','AccessDenied','NoSuchBucket']) {
    const bad=budgetStorageAdapter({send:async()=>{throw {name};}},'bucket','key');
    if(name==='NoSuchKey')assert.equal(await bad.read(),null);else await assert.rejects(bad.read());
  }
});
test('CSV quotes user text and neutralizes spreadsheet formulas', () => {
  const result=csv([entry({category:'=SUM(A1)',note:'  =HYPERLINK("bad")'})]);
  assert(result.includes('"\'=SUM(A1)"'));assert(result.includes('"\'  =HYPERLINK(""bad"")"'));assert(result.includes('"12.34","EUR"'));
});

test('categories with colliding old hashes and more than eight categories get distinct colors', () => {
  const names = ['AB', 'BA', ...Array.from({length: 24}, (_, i) => `Custom ${i}`)];
  const colors = categoryColors(names);
  assert.equal(new Set(colors.values()).size, names.length);
  assert.deepEqual(colors, categoryColors([...names].reverse()));
  assert.equal(categoryColors([...names, 'AB']).size, names.length);
});
