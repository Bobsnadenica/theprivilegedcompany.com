import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, summarize, validateState, csv } from '../src/model.js';
import { goalSummary, goalReaction } from '../src/goals.js';
import { WEALTH_LIMITS, normalizeDecimal, holdingValue, cashBalance, tradeCashMovement, validateWealth, wealthSummary,
  createHolding, updateHolding, removeHolding, recordTrade, updateTrade, removeTrade,
  createLiability, updateLiability, removeLiability } from '../src/wealth-model.js';

const date = '2026-10-01';
function stateWithCash(opening = 20000) {
  const state = createState(date);
  state.opening = opening;
  state.goals = [{ id: 'goal-car', kind: 'car', title: 'New car', target: 100000 }];
  return state;
}
function holding(state, patch = {}) {
  return createHolding(state, { id: 'position', kind: 'stock', name: 'Example stock', symbol: 'EX',
    openingQuantity: '0', price: '50', valuedAt: date, ...patch });
}
function trade(state, patch = {}) {
  return recordTrade(state, { id: 'purchase', holdingId: 'position', side: 'buy', quantity: '2', amount: 10000, date, ...patch });
}
function rejectsUnchanged(state, action, expected = /invalidSave/) {
  const before = structuredClone(state);
  assert.throws(action, expected);
  assert.deepEqual(state, before, 'A rejected operation leaves every saved field unchanged');
}

test('manual decimal inputs retain eight places without accepting exponent or floating-point numbers', () => {
  assert.equal(normalizeDecimal(' 0001,23000000 '), '1.23');
  assert.equal(normalizeDecimal('0.00000001'), '0.00000001');
  assert.equal(normalizeDecimal('0000.00000000'), '0');
  assert.equal(normalizeDecimal('999999999999.99999999'), '999999999999.99999999');
  for (const invalid of [1, 0.1, '', '.1', '1.', '-1', '+1', '1e8', 'Infinity', 'NaN', '1.000000001', '1000000000000', '1,2,3']) {
    assert.throws(() => normalizeDecimal(invalid), /amount/);
  }
  assert.throws(() => normalizeDecimal('0', false), /amount/);
});

test('marked values round half up once per holding at the supported money boundary', () => {
  assert.equal(holdingValue('1', '0.005'), 1);
  assert.equal(holdingValue('0.99999999', '0.005'), 0);
  assert.equal(holdingValue('1.00000001', '0.005'), 1);
  assert.equal(holdingValue('123456789012.34567891', '0.00000001'), 123457);
  assert.equal(holdingValue('999999999999.99999999', '0.00000001'), 1000000);
  assert.equal(holdingValue('1', '99999999.99'), 9999999999);
  assert.equal(holdingValue('0', '999999999999.99999999'), 0);
  assert.throws(() => holdingValue('1', '100000000'), /amount/);
  const state = stateWithCash(0);
  holding(state, { openingQuantity: '1', price: '0.005' });
  holding(state, { id: 'second', openingQuantity: '1', price: '0.005' });
  assert.equal(wealthSummary(state).investments, 2, 'The total equals the sum of rounded visible position values');
});

test('adding an already owned position is cash neutral, including when no savings goal exists', () => {
  const state = stateWithCash(10000), before = structuredClone(state);
  const owned = holding(state, { openingQuantity: '2.25', price: '400', symbol: ' ex ' });
  assert.equal(owned.symbol, 'EX');
  assert.deepEqual([wealthSummary(state).cash, wealthSummary(state).investments, wealthSummary(state).netWorth], [10000, 90000, 100000]);
  assert.equal(wealthSummary(state).holdings[0].quantity, '2.25');
  assert.equal(goalSummary(state).balance, goalSummary(before).balance);
  assert.deepEqual(summarize(state, '2026-10'), summarize(before, '2026-10'));
  assert.equal(goalReaction(before, state).transfer, false);
  state.goals = [];
  assert.equal(goalSummary(state), null); assert.equal(cashBalance(state), 10000);
  assert.equal(wealthSummary(state).netWorth, 100000);
});

test('purchases transfer cash into investments without double counting or becoming a monthly expense', () => {
  const state = stateWithCash(), before = structuredClone(state);
  state.goals.push({ id: 'goal-travel', kind: 'travel', title: 'Travel', target: 100000 });
  holding(state); trade(state);
  const summary = wealthSummary(state);
  assert.deepEqual([summary.cash, summary.investments, summary.netWorth, tradeCashMovement(state)], [10000, 10000, 20000, -10000]);
  assert.equal(summary.holdings[0].quantity, '2');
  assert.equal(goalSummary(state).balance, 10000);
  assert.deepEqual(goalSummary(state).goals.map(goal => goal.balance), [5000, 5000]);
  const monthly = summarize(state, '2026-10');
  assert.deepEqual([monthly.income, monthly.expense, monthly.saving, monthly.entries.length], [0, 0, 0, 0]);
  assert.equal(csv(state, '2026-10').split('\r\n').length, 1, 'Budget CSV contains only income and expense ledger records');
  before.goals = structuredClone(state.goals);
  assert.equal(goalReaction(before, state).delta, -10000); assert.equal(goalReaction(before, state).transfer, true);
  validateState(state);
});

test('sales use entered settlement cash while current marks only value units still owned', () => {
  const state = stateWithCash(); holding(state); trade(state);
  updateHolding(state, 'position', { price: '60', valuedAt: '2026-10-02' });
  assert.equal(wealthSummary(state).netWorth, 22000);
  const before = structuredClone(state);
  trade(state, { id: 'sale', side: 'sell', quantity: '0.5', amount: 3500, date: '2026-10-03' });
  const summary = wealthSummary(state);
  assert.deepEqual([summary.cash, summary.holdings[0].quantity, summary.investments, summary.netWorth], [13500, '1.5', 9000, 22500]);
  assert.equal(goalReaction(before, state).delta, 3500); assert.equal(goalReaction(before, state).transfer, true);
  assert.deepEqual(summary.trades.map(item => item.id), ['sale', 'purchase']);
  assert.deepEqual([summarize(state, '2026-10').income, summarize(state, '2026-10').expense], [0, 0]);
});

test('fractional crypto sales retain the last unit exactly and reject one extra unit atomically', () => {
  const state = stateWithCash();
  holding(state, { kind: 'crypto', openingQuantity: '0.10000001', price: '1000' });
  trade(state, { id: 'fractional-sale', side: 'sell', quantity: '0.1', amount: 10000 });
  assert.equal(wealthSummary(state).holdings[0].quantity, '0.00000001');
  rejectsUnchanged(state, () => trade(state, { id: 'oversale', side: 'sell', quantity: '0.00000002', amount: 1 }), /tradeOversell/);
  trade(state, { id: 'last-sale', side: 'sell', quantity: '0.00000001', amount: 1 });
  assert.equal(wealthSummary(state).holdings[0].quantity, '0');
  assert.equal(wealthSummary(state).holdings[0].value, 0);
  rejectsUnchanged(state, () => removeHolding(state, 'position'), /holdingUsed/);
});

test('chronological inventory rejects sales before purchases and respects same-day input order', () => {
  const state = stateWithCash(); holding(state);
  trade(state, { date: '2026-10-03' });
  rejectsUnchanged(state, () => trade(state, { id: 'earlier-sale', side: 'sell', quantity: '1', amount: 5000, date: '2026-10-02' }), /tradeOversell/);
  trade(state, { id: 'same-day-sale', side: 'sell', quantity: '2', amount: 10000, date: '2026-10-03' });
  assert.equal(wealthSummary(state).holdings[0].quantity, '0');
  rejectsUnchanged(state, () => updateTrade(state, 'purchase', { date: '2026-10-04' }), /tradeOversell/);
  rejectsUnchanged(state, () => removeTrade(state, 'purchase'), /tradeOversell/);
  removeTrade(state, 'same-day-sale'); removeTrade(state, 'purchase'); removeHolding(state, 'position');
  assert.deepEqual([state.holdings.length, state.investmentTrades.length, cashBalance(state)], [0, 0, 20000]);
});

test('opening quantity corrections and trade corrections cannot invalidate a past sale', () => {
  const state = stateWithCash(); holding(state, { openingQuantity: '3' });
  trade(state, { id: 'sale', side: 'sell', quantity: '2', amount: 10000 });
  rejectsUnchanged(state, () => updateHolding(state, 'position', { openingQuantity: '1.99999999' }), /tradeOversell/);
  updateHolding(state, 'position', { openingQuantity: '2' });
  assert.equal(wealthSummary(state).holdings[0].quantity, '0');
  updateTrade(state, 'sale', { quantity: '1.25', amount: 6250 });
  assert.deepEqual([wealthSummary(state).holdings[0].quantity, cashBalance(state)], ['0.75', 26250]);
});

test('manual prices and liabilities change net worth without changing cash or monthly totals', () => {
  const state = stateWithCash(); holding(state, { openingQuantity: '2' });
  const before = structuredClone(state);
  updateHolding(state, 'position', { price: '75.125', name: 'Updated name' });
  assert.equal(wealthSummary(state).investments, 15025); assert.equal(cashBalance(state), 20000);
  createLiability(state, { id: 'loan', name: 'Car loan', amount: 50000 });
  assert.deepEqual([wealthSummary(state).cash, wealthSummary(state).liabilities, wealthSummary(state).netWorth], [20000, 50000, -14975]);
  assert.equal(goalSummary(state).balance, goalSummary(before).balance);
  assert.equal(goalReaction(before, state).delta, 0); assert.equal(goalReaction(before, state).transfer, false);
  assert.deepEqual(summarize(state, '2026-10'), summarize(before, '2026-10'));
  updateLiability(state, 'loan', { amount: 0 });
  assert.equal(wealthSummary(state).netWorth, 35025);
  removeLiability(state, 'loan'); assert.deepEqual(state.liabilities, []);
  validateState(state);
});

test('investment settlements coexist with real monthly cashflow and legacy savings transfers', () => {
  const state = stateWithCash(10000);
  state.entries = [
    { id: 'income', type: 'income', category: 'income', amount: 5000, date, note: '' },
    { id: 'expense', type: 'expense', category: 'other', essential: true, amount: 2000, date, note: '' },
    { id: 'saving', type: 'saving', category: 'saving', amount: 3000, date, note: '' },
  ];
  holding(state); trade(state);
  assert.deepEqual([cashBalance(state), goalSummary(state).balance, wealthSummary(state).netWorth], [3000, 3000, 13000]);
  const monthly = summarize(state, '2026-10');
  assert.deepEqual([monthly.income, monthly.expense, monthly.saving], [5000, 2000, 3000]);
  validateState(state);
});

test('backup validation rejects invalid fields, duplicate IDs, dangling references and unsafe position sizes', () => {
  const original = stateWithCash(); holding(original); trade(original);
  createLiability(original, { id: 'loan', name: 'Loan', amount: 100 });
  for (const change of [
    state => { state.holdings[0].kind = 'bond'; }, state => { state.holdings[0].name = ' '; },
    state => { state.holdings[0].name = 'x'.repeat(65); }, state => { state.holdings[0].symbol = 'X'.repeat(21); },
    state => { state.holdings[0].openingQuantity = 1; }, state => { state.holdings[0].openingQuantity = '1e3'; },
    state => { state.holdings[0].price = '1,5'; }, state => { state.holdings[0].price = '-1'; },
    state => { state.holdings[0].price = '0.000000001'; }, state => { state.holdings[0].price = '100000000'; },
    state => { state.holdings[0].valuedAt = '2026-02-30'; }, state => { state.holdings[0].id = state.liabilities[0].id; },
    state => { state.investmentTrades[0].id = state.holdings[0].id; }, state => { state.investmentTrades[0].holdingId = 'missing'; },
    state => { state.investmentTrades[0].quantity = '0'; }, state => { state.investmentTrades[0].amount = 0; },
    state => { state.investmentTrades[0].amount = 1.5; }, state => { state.investmentTrades[0].amount = 10000000000; },
    state => { state.investmentTrades[0].side = 'swap'; }, state => { state.investmentTrades[0].date = '2026-13-01'; },
    state => { state.liabilities[0].amount = -1; }, state => { state.liabilities[0].amount = Number.MAX_SAFE_INTEGER; },
    state => { state.liabilities[0].name = 'x'.repeat(65); },
  ]) {
    const state = structuredClone(original); change(state);
    assert.throws(() => validateState(state), /invalidSave/);
  }
  rejectsUnchanged(original, () => createHolding(original, { id: 'loan', kind: 'stock', name: 'Duplicate' }));
  rejectsUnchanged(original, () => createLiability(original, { id: 'position', name: 'Duplicate', amount: 1 }));
  rejectsUnchanged(original, () => trade(original, { id: 'purchase' }));
  const withEntry = structuredClone(original);
  withEntry.entries.push({ id: 'entry-id', type: 'income', category: 'income', amount: 1, date, note: '' });
  rejectsUnchanged(withEntry, () => createLiability(withEntry, { id: 'entry-id', name: 'Duplicate', amount: 1 }));
});

test('collection and derived quantity limits are enforced before committing mutations', () => {
  const original = stateWithCash(0); holding(original, { openingQuantity: '999999999999.99999999', price: '0' });
  rejectsUnchanged(original, () => trade(original, { quantity: '0.00000001', amount: 1 }));
  for (const [collection, limit, factory] of [
    ['holdings', WEALTH_LIMITS.holdings, id => ({ ...original.holdings[0], id, openingQuantity: '0' })],
    ['investmentTrades', WEALTH_LIMITS.trades, id => ({ id, holdingId: 'position', side: 'sell', quantity: '0.00000001', amount: 1, date })],
    ['liabilities', WEALTH_LIMITS.liabilities, id => ({ id, name: 'Debt', amount: 1 })],
  ]) {
    const state = structuredClone(original);
    state[collection] = Array.from({ length: limit + 1 }, (_, index) => factory(`item-${index}`));
    assert.throws(() => validateWealth(state), /invalidSave/);
  }
  const full = stateWithCash(0);
  full.holdings = Array.from({ length: WEALTH_LIMITS.holdings }, (_, index) => ({ id: `position-${index}`, kind: 'stock', name: 'Stock',
    symbol: '', openingQuantity: '0', price: '0', valuedAt: date }));
  rejectsUnchanged(full, () => holding(full), /limitReached/);
});

test('schema4 backup round trips preserve exact decimal strings, settlement history and revision', () => {
  const state = stateWithCash();
  holding(state, { kind: 'crypto', openingQuantity: '0.10000001', price: '123.45678901' });
  trade(state, { id: 'fractional-sale', side: 'sell', quantity: '0.1', amount: 1235 });
  createLiability(state, { id: 'loan', name: 'Loan', amount: 101 });
  const restored = validateState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(restored, state); assert.equal(restored.revision, state.revision);
  assert.deepEqual(wealthSummary(restored), wealthSummary(state));
  // Valid string representations remain lossless on import, then canonicalize
  // only if the user explicitly edits that position.
  restored.holdings[0].openingQuantity = '0000.10000001'; restored.holdings[0].price = '00123.45678901';
  assert.equal(validateState(restored).holdings[0].price, '00123.45678901');
  updateHolding(restored, 'position', { name: 'Corrected name' });
  assert.equal(restored.holdings[0].price, '123.45678901');
});

test('missing-position and missing-debt edits fail without erasing unrelated records', () => {
  const state = stateWithCash(); holding(state);
  rejectsUnchanged(state, () => updateHolding(state, 'missing', { price: '1' }), /holdingMissing/);
  rejectsUnchanged(state, () => removeHolding(state, 'missing'), /holdingMissing/);
  rejectsUnchanged(state, () => updateTrade(state, 'missing', { amount: 1 }), /tradeMissing/);
  rejectsUnchanged(state, () => removeTrade(state, 'missing'), /tradeMissing/);
  rejectsUnchanged(state, () => updateLiability(state, 'missing', { amount: 1 }), /liabilityMissing/);
  rejectsUnchanged(state, () => removeLiability(state, 'missing'), /liabilityMissing/);
});
