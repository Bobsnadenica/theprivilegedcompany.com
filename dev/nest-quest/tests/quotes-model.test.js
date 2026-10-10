import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, validateState, summarize, progress } from '../src/model.js';
import { goalSummary, goalReaction } from '../src/goals.js';
import { createCloudRepository } from '../src/repository.js';
import { remoteDecimal, convertQuotePrice, holdingQuoteSignature, applyHoldingQuotes, createHolding, updateHolding,
  removeHolding, recordTrade, wealthSummary, cashBalance } from '../src/wealth-model.js';

const today = () => new Date().toISOString().slice(0, 10);
function fixture() {
  const state = createState(today());
  state.opening = 50000;
  state.profile.started = true;
  state.goals = [{ id: 'car', kind: 'car', title: 'New car', target: 100000 }];
  state.entries = [
    { id: 'salary', type: 'income', category: 'income', amount: 10000, date: today(), note: '' },
    { id: 'food', type: 'expense', category: 'groceries', essential: true, amount: 2000, date: today(), note: '' },
  ];
  createHolding(state, { id: 'coin', kind: 'crypto', name: 'Bitcoin', symbol: 'BTC', openingQuantity: '2.00000001', price: '50', valuedAt: today(),
    market: { provider: 'coinlore', id: '90', symbol: 'BTC', currency: 'USD' } });
  return state;
}
function quote(patch = {}) {
  return { provider: 'coinlore', price: '90', sourcePrice: '100', sourceCurrency: 'USD', marketAt: null,
    fetchedAt: new Date().toISOString(), fxRate: '0.9', fxDate: today(), ...patch };
}
const update = (holding, mark = quote()) => ({ id: holding.id, expected: holdingQuoteSignature(holding), quote: mark });
function unchanged(state, operation) {
  const original = structuredClone(state);
  assert.throws(operation);
  assert.deepEqual(state, original, 'Rejected batches must leave the entire financial save intact');
}

test('remote decimal text rounds exactly to eight places, including exponent prices', () => {
  assert.equal(remoteDecimal('1.234567894'), '1.23456789');
  assert.equal(remoteDecimal('1.234567895'), '1.2345679');
  assert.equal(remoteDecimal('0.000000005'), '0.00000001');
  assert.equal(remoteDecimal('1.234567895e2'), '123.4567895');
  assert.equal(remoteDecimal(1e-8), '0.00000001');
  assert.equal(remoteDecimal('00001.230000000'), '1.23');
  assert.equal(remoteDecimal('0.000000004', true), '0');
  for (const invalid of [null, undefined, {}, [], NaN, Infinity, -1, '-0.1', '1,23', 'NaN', '0', '0.000000004', '1e1001', '1e-1001', '1000000000000', '9.99999999999999999999e11']) {
    assert.throws(() => remoteDecimal(invalid), `Reject ${String(invalid)}`);
  }
});

test('quote conversion uses exact multiplication and one half-up eight-place rounding', () => {
  assert.equal(convertQuotePrice('123.45678901', '0.9'), '111.11111011');
  assert.equal(convertQuotePrice('0.00000001', '0.5'), '0.00000001');
  assert.equal(convertQuotePrice('100', '1.95583'), '195.583');
  assert.equal(convertQuotePrice('100', '1'), '100');
  assert.throws(() => convertQuotePrice('0.00000001', '0.49999999'));
  assert.throws(() => convertQuotePrice('999999999999', '2'));
  assert.throws(() => convertQuotePrice('100', '0'));
  assert.throws(() => convertQuotePrice('1e2', '0.9'));
});

test('refresh values existing quantities without cash transfers, budget entries or goal progress', () => {
  const state = fixture();
  recordTrade(state, { id: 'buy', holdingId: 'coin', side: 'buy', quantity: '0.25', amount: 1000, date: today() });
  const before = structuredClone(state), month = today().slice(0, 7), cash = cashBalance(state);
  const result = applyHoldingQuotes(state, [update(state.holdings[0])]);
  assert.deepEqual(result, { applied: ['coin'], skipped: [] });
  assert.equal(state.holdings[0].price, '90');
  assert.equal(wealthSummary(state).holdings[0].quantity, '2.25000001');
  assert.equal(wealthSummary(state).holdings[0].value, 20250);
  assert.equal(wealthSummary(state).netWorth - wealthSummary(before).netWorth, 9000);
  assert.equal(cashBalance(state), cash);
  assert.deepEqual(summarize(state, month), summarize(before, month));
  assert.deepEqual(goalSummary(state), goalSummary(before));
  assert.deepEqual(progress(state), progress(before));
  assert.equal(goalReaction(before, state).delta, 0);
  assert.equal(goalReaction(before, state).transfer, false);
  const { holdings: changedHoldings, ...untouched } = state;
  const { holdings: originalHoldings, ...expected } = before;
  assert.deepEqual(untouched, expected);
  assert.deepEqual(state.investmentTrades, before.investmentTrades);
  validateState(state);
});

test('optional quote fields keep version4 manual saves and quote backups lossless', () => {
  const manual = fixture();
  delete manual.holdings[0].market;
  assert.deepEqual(validateState(JSON.parse(JSON.stringify(manual))), manual);
  assert.equal(manual.version, 4);
  const state = fixture();
  applyHoldingQuotes(state, [update(state.holdings[0])]);
  const restored = validateState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(restored, state);
  assert.deepEqual(wealthSummary(restored), wealthSummary(state));
  assert.equal(restored.revision, state.revision);
});

test('name and quantity edits preserve valid provenance; manual price/date/relink edits remove it', () => {
  const original = fixture();
  applyHoldingQuotes(original, [update(original.holdings[0])]);
  const existingQuote = structuredClone(original.holdings[0].quote);
  updateHolding(original, 'coin', { name: 'My Bitcoin', openingQuantity: '3' });
  assert.deepEqual(original.holdings[0].quote, existingQuote);
  updateHolding(original, 'coin', { price: '90', valuedAt: original.holdings[0].valuedAt, symbol: 'btc' });
  assert.deepEqual(original.holdings[0].quote, existingQuote, 'Unchanged values in an ordinary full form submit retain provenance');
  for (const patch of [
    { price: '91' }, { valuedAt: '2020-01-01' }, { kind: 'stock', market: { provider: 'licensed', id: 'BTC-ETF', symbol: 'BTC', currency: 'USD' } },
    { symbol: 'ETH', market: { provider: 'coinlore', id: '80', symbol: 'ETH', currency: 'USD' } },
    { market: { provider: 'coinlore', id: 'another-btc', symbol: 'BTC', currency: 'USD' } }, { market: null },
  ]) {
    const state = structuredClone(original);
    updateHolding(state, 'coin', patch);
    assert.equal(Object.hasOwn(state.holdings[0], 'quote'), false);
    validateState(state);
  }
});

test('invalid quotes, source metadata and future timestamps reject without any mutation', () => {
  const badQuotes = [
    { provider: 'unknown' }, { price: '91' }, { price: '0' }, { price: 90 }, { sourcePrice: '0' }, { sourcePrice: '100.000000000' },
    { sourcePrice: '0100' }, { sourceCurrency: 'JPY' }, { fxRate: '0' }, { fxRate: '-1' }, { fxRate: '1.000000001' },
    { fxDate: '2026-02-30' }, { fxDate: '2099-01-01' }, { marketAt: '2026-02-30' }, { marketAt: '2026-02-30T12:00:00Z' },
    { marketAt: new Date(Date.now() + 600000).toISOString() }, { fetchedAt: new Date(Date.now() + 600000).toISOString() },
    { fetchedAt: '2026-10-01T24:00:00Z' }, { fetchedAt: '2026-10-01' }, { marketAt: '<script>' }, { arbitrary: 'unexpected' },
  ];
  for (const patch of badQuotes) {
    const state = fixture();
    unchanged(state, () => applyHoldingQuotes(state, [update(state.holdings[0], quote(patch))]));
  }
  const state = fixture();
  applyHoldingQuotes(state, [update(state.holdings[0], quote({ fetchedAt: new Date(Date.now() + 120000).toISOString(), marketAt: new Date(Date.now() + 60000).toISOString() }))]);
  validateState(state);
});

test('invalid linked identities and quote-price mismatches fail imported save validation', () => {
  const original = fixture();
  applyHoldingQuotes(original, [update(original.holdings[0])]);
  for (const mutate of [
    h => { h.market.symbol = 'ETH'; }, h => { h.market.symbol = 'btc'; }, h => { h.market.id = ''; }, h => { h.market.id = 'x'.repeat(65); },
    h => { h.market.currency = 'JPY'; }, h => { h.market.provider = 'unknown'; }, h => { h.market.extra = true; },
    h => { h.kind = 'stock'; }, h => { h.price = '91'; }, h => { delete h.market; }, h => { h.quote.sourceCurrency = 'GBP'; },
  ]) {
    const state = structuredClone(original); mutate(state.holdings[0]);
    assert.throws(() => validateState(state), /invalidSave/);
  }
});

test('same-currency quotes cannot invent an FX conversion', () => {
  const state = fixture(); state.profile.currency = 'USD';
  unchanged(state, () => applyHoldingQuotes(state, [update(state.holdings[0])]));
  applyHoldingQuotes(state, [update(state.holdings[0], quote({ price: '100', fxRate: '1' }))]);
  assert.equal(state.holdings[0].price, '100');
  validateState(state);
});

test('one malformed mark or over-limit valuation rejects an entire multi-position batch', () => {
  const state = fixture();
  createHolding(state, { ...state.holdings[0], id: 'second', openingQuantity: '1' });
  unchanged(state, () => applyHoldingQuotes(state, [update(state.holdings[0]), update(state.holdings[1], quote({ price: '91' }))]));
  unchanged(state, () => applyHoldingQuotes(state, [update(state.holdings[0]), update(state.holdings[1], quote({ price: '100000000', sourcePrice: '100000000', fxRate: '1' }))]));
  unchanged(state, () => applyHoldingQuotes(state, [update(state.holdings[0]), update(state.holdings[0])]));
});

test('removed, relinked, edited and already-refreshed snapshot signatures are skipped', () => {
  for (const change of [
    state => removeHolding(state, 'coin'),
    state => updateHolding(state, 'coin', { price: '55' }),
    state => updateHolding(state, 'coin', { name: 'Edited during request' }),
    state => updateHolding(state, 'coin', { openingQuantity: '3' }),
    state => updateHolding(state, 'coin', { market: { provider: 'coinlore', id: 'different-btc', symbol: 'BTC', currency: 'USD' } }),
    state => applyHoldingQuotes(state, [update(state.holdings[0])]),
  ]) {
    const state = fixture(), pending = update(state.holdings[0]);
    change(state); const current = structuredClone(state);
    assert.deepEqual(applyHoldingQuotes(state, [pending]), { applied: [], skipped: ['coin'] });
    assert.deepEqual(state, current);
  }
});

test('fresh unchanged positions apply while stale positions keep their previous marks', () => {
  const state = fixture();
  createHolding(state, { ...state.holdings[0], id: 'second', openingQuantity: '1' });
  const pending = state.holdings.map(item => update(item));
  updateHolding(state, 'coin', { price: '51' });
  assert.deepEqual(applyHoldingQuotes(state, pending), { applied: ['second'], skipped: ['coin'] });
  assert.deepEqual(state.holdings.map(item => item.price), ['51', '90']);
  validateState(state);
});

test('signatures ignore object key ordering while binding all saved holding values', () => {
  const state = fixture(), holding = state.holdings[0];
  const reordered = { ...holding, market: { currency: 'USD', symbol: 'BTC', id: '90', provider: 'coinlore' } };
  assert.equal(holdingQuoteSignature(holding), holdingQuoteSignature(reordered));
  assert.notEqual(holdingQuoteSignature(holding), holdingQuoteSignature({ ...holding, valuedAt: '2020-01-01' }));
});

test('successful quote provenance persists through conditional cloud saves and reloads', async () => {
  let remote = null;
  const adapter = {
    async read() { return structuredClone(remote); },
    async write(state, etag) {
      assert.equal(etag, remote?.etag || null);
      remote = { etag: remote ? 'second' : 'first', ledger: structuredClone(state) };
      return remote.etag;
    },
  };
  const state = fixture(), repository = createCloudRepository(adapter);
  await repository.load(); await repository.save(state);
  applyHoldingQuotes(state, [update(state.holdings[0])]);
  state.revision = crypto.randomUUID();
  await repository.save(state);
  assert.deepEqual(await createCloudRepository(adapter).load(), state);
  assert.deepEqual(remote.ledger.holdings[0].quote, state.holdings[0].quote);
});
