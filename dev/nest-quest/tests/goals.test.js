import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, demoState, validateState, uuid } from '../src/model.js';
import { GOAL_PRESETS, GOAL_MILESTONES, goalSummary, goalReaction } from '../src/goals.js';

const date = '2026-10-01';
function stateWithGoal(target = 3000000, opening = 0) {
  const state = createState(date);
  state.goals = [{ id: uuid(), kind: 'car', title: 'New car', target }];
  state.opening = opening;
  return state;
}
function entry(type, amount, entryDate = date) {
  return { id: uuid(), type, amount, category: type === 'expense' ? 'other' : type,
    note: '', date: entryDate, ...(type === 'expense' ? { essential: true } : {}) };
}

test('new adventures wait for a goal and expose the requested preset amounts', () => {
  const state = createState(date);
  assert.equal(state.version, 4); assert.deepEqual(state.goals, []); assert.equal(state.opening, 0);
  assert.deepEqual(state.customCategories, []); assert.deepEqual(state.holdings, []);
  assert.deepEqual(state.investmentTrades, []); assert.deepEqual(state.liabilities, []);
  assert.equal(goalSummary(state), null);
  assert.deepEqual(GOAL_PRESETS.map(goal => [goal.kind, goal.target]), [
    ['car', 3000000], ['wedding', 5000000], ['house', 10000000],
    ['emergency', 1000000], ['travel', 200000], ['custom', 1000000],
  ]);
  assert.deepEqual(GOAL_MILESTONES, [0, .1, .25, .5, .75, 1]);
});

test('income adds to a lifetime goal; every expense removes money including essentials', () => {
  const state = stateWithGoal(100000, 20000), before = structuredClone(state);
  state.entries.push(entry('income', 50000, '2026-09-30'), entry('expense', 12000, '2026-10-01'));
  const summary = goalSummary(state);
  assert.deepEqual([summary.balance, summary.income, summary.expense, summary.remaining], [58000, 50000, 12000, 42000]);
  assert.equal(summary.ratio, .58); assert.equal(summary.percent, 58); assert.equal(summary.stage, 'adventurer');
  assert.equal(summary.milestone, 3);
  assert.equal(goalReaction(before, state).delta, 38000);
});

test('legacy saving transfers never add money twice or reduce money available for a goal', () => {
  const state = stateWithGoal(100000, 25000);
  state.entries = [entry('income', 80000), entry('expense', 30000), entry('saving', 50000)];
  assert.equal(goalSummary(state).balance, 75000);
  const before = structuredClone(state); state.entries.push(entry('saving', 10000));
  assert.equal(goalSummary(state).balance, 75000);
  assert.equal(goalReaction(before, state).delta, 0);
});

test('goals use available cash while owned investments and manual marks remain separate', () => {
  const state = stateWithGoal(100000, 80000);
  state.holdings = [{ id: 'owned-shares', kind: 'stock', name: 'Existing shares', symbol: 'TEST',
    openingQuantity: '2', price: '10', valuedAt: date }];
  assert.equal(goalSummary(state).balance, 80000, 'Owned shares never create cash for a goal');
  const before = structuredClone(state);
  state.holdings[0].price = '500';
  assert.equal(goalSummary(state).balance, 80000, 'A manual market mark never creates goal cash');
  assert.equal(goalReaction(before, state).delta, 0);
  state.liabilities = [{ id: 'loan', name: 'Remaining debt', amount: 75000 }];
  assert.equal(goalSummary(state).balance, 80000, 'A debt snapshot is separate from cash payments');
  validateState(state);
});

test('investment purchases and sales change goal cash once without becoming income or spending', () => {
  const state = stateWithGoal(100000, 80000);
  state.holdings = [{ id: 'owned-shares', kind: 'stock', name: 'Existing shares', symbol: 'TEST',
    openingQuantity: '2', price: '10', valuedAt: date }];
  let before = structuredClone(state);
  state.investmentTrades.push({ id: 'buy-shares', holdingId: 'owned-shares', side: 'buy', quantity: '3', amount: 3000, date });
  let summary = goalSummary(state), reaction = goalReaction(before, state);
  assert.deepEqual([summary.balance, summary.income, summary.expense, summary.remaining], [77000, 0, 0, 23000]);
  assert.equal(reaction.delta, -3000); assert.equal(reaction.transfer, true);
  before = structuredClone(state);
  state.investmentTrades.push({ id: 'sell-shares', holdingId: 'owned-shares', side: 'sell', quantity: '1', amount: 1500, date });
  summary = goalSummary(state); reaction = goalReaction(before, state);
  assert.deepEqual([summary.balance, summary.income, summary.expense, summary.remaining], [78500, 0, 0, 21500]);
  assert.equal(reaction.delta, 1500); assert.equal(reaction.transfer, true);
  validateState(state);
});

test('expenses visibly reverse milestone progress, evolution, and goal completion', () => {
  const state = stateWithGoal(100000, 100000), before = structuredClone(state);
  state.entries.push(entry('expense', 80000));
  const summary = goalSummary(state), reaction = goalReaction(before, state);
  assert.equal(summary.balance, 20000); assert.equal(summary.percent, 20);
  assert.equal(summary.completed, false); assert.equal(summary.stage, 'young'); assert.equal(summary.milestone, 1);
  assert.deepEqual(reaction, { delta: -80000, direction: 'down', goalChanged: false, transfer: false,
    milestoneUp: false, milestoneDown: true, completed: false, reopened: true });
});

test('income triggers new milestone and completion once; reload or a transfer does not repeat it', () => {
  const state = stateWithGoal(100000, 74000), before = structuredClone(state);
  state.entries.push(entry('income', 26000));
  const summary = goalSummary(state), reaction = goalReaction(before, state);
  assert.equal(summary.stage, 'guardian'); assert.equal(summary.milestone, 5); assert.equal(summary.remaining, 0);
  assert.equal(reaction.completed, true); assert.equal(reaction.milestoneUp, true); assert.equal(reaction.delta, 26000);
  assert.equal(goalReaction(state, structuredClone(state)).completed, false);
});

test('negative balances and overfunded goals retain their real amount while clamping the progress bar', () => {
  const state = stateWithGoal(10000, 2000); state.entries.push(entry('expense', 2500));
  assert.deepEqual([goalSummary(state).balance, goalSummary(state).ratio, goalSummary(state).remaining], [-500, 0, 10500]);
  state.entries = [entry('income', 12000)];
  assert.deepEqual([goalSummary(state).balance, goalSummary(state).ratio, goalSummary(state).remaining], [14000, 1, 0]);
});

test('changing a goal does not invent an income reaction or completion', () => {
  const before = stateWithGoal(100000, 25000), after = structuredClone(before);
  after.goals[0] = { ...after.goals[0], id: uuid(), kind: 'travel', title: 'Summer trip', target: 10000 };
  assert.equal(after.opening, 25000, 'Changing the goal preserves opening money');
  assert.equal(goalSummary(after).completed, true);
  assert.deepEqual(goalReaction(before, after), { delta: 0, direction: 'steady', goalChanged: true, transfer: false,
    milestoneUp: false, milestoneDown: false, completed: false, reopened: false });
  assert.equal(goalReaction(createState(date), after).completed, false);
});

test('version 1 saves migrate without changing ledger, plans, rewards, or lock revision', () => {
  const { goals: oldGoals, opening: oldOpening, customCategories: oldCategories, holdings: oldHoldings, investmentTrades: oldTrades, liabilities: oldLiabilities, ...legacy } = demoState(date);
  legacy.version = 1;
  const original = structuredClone(legacy), migrated = validateState(legacy);
  assert.equal(migrated.version, 4); assert.deepEqual(migrated.goals, []); assert.equal(migrated.opening, 0);
  assert.deepEqual(migrated.customCategories, []); assert.deepEqual(migrated.holdings, []);
  assert.deepEqual(migrated.investmentTrades, []); assert.deepEqual(migrated.liabilities, []);
  assert.equal(Object.hasOwn(migrated, 'goal'), false);
  const { version, goals, opening, customCategories, holdings, investmentTrades, liabilities, ...preserved } = migrated;
  const { version: oldVersion, ...expected } = original;
  assert.deepEqual(preserved, expected);
  assert.deepEqual(legacy, original, 'Validation does not rewrite the input save');
  assert.equal(migrated.revision, original.revision);
  assert.equal(validateState(migrated), migrated);
});

test('goal validation rejects missing fields, malformed amounts, and unsupported goal types', () => {
  const original = stateWithGoal(); validateState(original);
  for (const change of [
    s => { delete s.goals; }, s => { s.goals = null; }, s => { s.goals[0].id = 'invalid id'; },
    s => { s.goals[0].title = ' '; }, s => { s.goals[0].title = 'x'.repeat(65); },
    s => { s.goals[0].kind = 'investment'; }, s => { s.goals[0].target = 0; },
    s => { s.goals[0].target = 10000000000; }, s => { s.goals[0].target = 1.5; },
    s => { s.opening = -1; }, s => { s.opening = Number.MAX_SAFE_INTEGER; },
    s => { s.opening = NaN; }, s => { delete s.opening; },
    s => { s.goal = null; }, s => { s.goals.push({ ...s.goals[0] }); },
    s => { s.goals = Array.from({ length: 13 }, () => ({ ...s.goals[0], id: uuid() })); },
  ]) {
    const state = structuredClone(original); change(state);
    assert.throws(() => validateState(state), /invalidSave/);
  }
});

test('goal totals reject unsafe inputs and remain exact at supported save limits', () => {
  const state = stateWithGoal(9999999999, 9999999999);
  state.entries = Array.from({ length: 10000 }, () => entry('income', 9999999999));
  assert.equal(goalSummary(state).balance, 100009999989999);
  assert.equal(goalSummary(state).remaining, 0);
  state.entries[0].amount = Number.MAX_SAFE_INTEGER;
  assert.throws(() => goalSummary(state), /invalidSave/);
  state.entries = Array(10001).fill(entry('income', 1));
  assert.throws(() => goalSummary(state), /invalidSave/);
});

test('demo shares its single fund across car, wedding, and home goals', () => {
  const state = demoState(date), summary = goalSummary(state);
  assert.equal(state.version, 4); assert.deepEqual(state.goals.map(goal => goal.kind), ['car', 'wedding', 'house']);
  assert.equal(state.opening, 730000); assert.equal(summary.target, 18000000);
  assert.equal(summary.balance, 853200); assert.equal(summary.percent, 4); assert.equal(summary.stage, 'young');
  assert.deepEqual(summary.goals.map(goal => goal.balance), [142200, 237000, 474000]);
  validateState(state);
});

test('version 2 migration moves one opening balance to the shared fund without rewriting history', () => {
  const { goals, opening, customCategories, holdings, investmentTrades, liabilities, ...legacy } = demoState(date);
  legacy.version = 2; legacy.goal = { ...goals[0], opening };
  legacy.extraMetadata = { importedBy: 'owner', labels: ['Keep this'] };
  const original = structuredClone(legacy), migrated = validateState(legacy);
  assert.equal(migrated.version, 4); assert.equal(Object.hasOwn(migrated, 'goal'), false);
  assert.equal(migrated.opening, opening); assert.deepEqual(migrated.goals, [goals[0]]);
  assert.equal(Object.hasOwn(migrated.goals[0], 'opening'), false);
  assert.deepEqual(migrated.customCategories, []); assert.deepEqual(migrated.holdings, []);
  assert.deepEqual(migrated.investmentTrades, []); assert.deepEqual(migrated.liabilities, []);
  const { version, goal, ...before } = original;
  const { version: nextVersion, goals: nextGoals, opening: nextOpening, customCategories: nextCategories, holdings: nextHoldings, investmentTrades: nextTrades, liabilities: nextLiabilities, ...after } = migrated;
  assert.deepEqual(after, before); assert.deepEqual(legacy, original);
  assert.equal(goalSummary(migrated).balance, 853200);
  const emptyLegacy = { ...original, goal: null };
  assert.deepEqual(validateState(emptyLegacy).goals, []); assert.equal(validateState(emptyLegacy).opening, 0);
  for (const goalChange of [
    value => { delete value.opening; }, value => { value.opening = -1; },
    value => { value.opening = Number.MAX_SAFE_INTEGER; }, value => { value.target = 0; },
  ]) {
    const invalid = structuredClone(original); goalChange(invalid.goal);
    assert.throws(() => validateState(invalid), /invalidSave/);
  }
});

test('version 3 migration adds empty wealth records while preserving the entire existing adventure', () => {
  const { holdings, investmentTrades, liabilities, ...legacy } = demoState(date);
  legacy.version = 3;
  legacy.extraMetadata = { labels: ['Keep all history'], source: 'owner backup' };
  const original = structuredClone(legacy), migrated = validateState(legacy);
  assert.equal(migrated.version, 4);
  assert.deepEqual(migrated.holdings, []); assert.deepEqual(migrated.investmentTrades, []);
  assert.deepEqual(migrated.liabilities, []);
  const { version, holdings: nextHoldings, investmentTrades: nextTrades, liabilities: nextLiabilities, ...preserved } = migrated;
  const { version: oldVersion, ...expected } = original;
  assert.deepEqual(preserved, expected);
  assert.deepEqual(legacy, original, 'Migration leaves the original backup available');
  assert.equal(migrated.revision, original.revision);
  assert.equal(goalSummary(migrated).balance, 853200, 'No cash or asset value is invented by migration');
  assert.equal(validateState(migrated), migrated);
});

test('multiple goals allocate each cent once with exact largest remainders', () => {
  const state = stateWithGoal(2, 7);
  state.goals = [
    { id: 'goal-a', kind: 'car', title: 'Car', target: 2 },
    { id: 'goal-b', kind: 'wedding', title: 'Wedding', target: 3 },
    { id: 'goal-c', kind: 'house', title: 'Home', target: 5 },
  ];
  const summary = goalSummary(state);
  assert.equal(summary.balance, 7); assert.equal(summary.target, 10); assert.equal(summary.surplus, 0);
  assert.deepEqual(summary.goals.map(goal => goal.balance), [1, 2, 4]);
  assert.equal(summary.goals.reduce((sum, goal) => sum + goal.balance, 0), summary.balance);
  assert.deepEqual(summary.goals.map(goal => goal.remaining), [1, 1, 1]);
  validateState(state);
});

test('equal allocation remainders break ties by id and never depend on display order', () => {
  const state = stateWithGoal(1, 2);
  state.goals = ['goal-c', 'goal-b', 'goal-a'].map(id => ({ id, kind: 'custom', title: id, target: 1 }));
  const before = structuredClone(state);
  const balances = summary => Object.fromEntries(summary.goals.map(goal => [goal.id, goal.balance]));
  assert.deepEqual(balances(goalSummary(state)), { 'goal-c': 0, 'goal-b': 1, 'goal-a': 1 });
  state.goals.reverse();
  assert.deepEqual(balances(goalSummary(state)), balances(goalSummary(before)));
  assert.equal(goalReaction(before, state).goalChanged, false);
});

test('surplus is separate, allocations cap at each target, and deficits never create negative goal contributions', () => {
  const state = stateWithGoal(100, 350);
  state.goals.push({ id: uuid(), kind: 'wedding', title: 'Wedding', target: 200 });
  let summary = goalSummary(state);
  assert.equal(summary.balance, 350); assert.equal(summary.surplus, 50);
  assert.deepEqual(summary.goals.map(goal => [goal.balance, goal.completed]), [[100, true], [200, true]]);
  state.entries.push(entry('expense', 400)); summary = goalSummary(state);
  assert.equal(summary.balance, -50); assert.equal(summary.surplus, 0); assert.equal(summary.remaining, 350);
  assert.deepEqual(summary.goals.map(goal => goal.balance), [0, 0]);
  assert.equal(summary.ratio, 0); assert.equal(summary.completed, false);
});

test('adding, removing, or retargeting goals changes allocation but never invents a money reward', () => {
  const before = stateWithGoal(100, 50);
  for (const change of [
    state => { state.goals.push({ id: uuid(), kind: 'custom', title: 'Another goal', target: 100 }); },
    state => { state.goals = []; },
    state => { state.goals[0].target = 25; },
  ]) {
    const after = structuredClone(before); change(after);
    assert.deepEqual(goalReaction(before, after), { delta: 0, direction: 'steady', goalChanged: true, transfer: false,
      milestoneUp: false, milestoneDown: false, completed: false, reopened: false });
  }
  const renamed = structuredClone(before); renamed.goals[0].title = 'Same target, better name';
  renamed.entries.push(entry('income', 10));
  assert.equal(goalReaction(before, renamed).delta, 10, 'Renaming does not hide a real income change');
});

test('multiple maximum-size goals use exact integer multiplication rather than rounded floating products', () => {
  const state = stateWithGoal(9999999999, 0);
  state.goals = Array.from({ length: 12 }, (_, index) => ({ id: `goal-${String(index).padStart(2, '0')}`,
    kind: 'custom', title: `Goal ${index}`, target: 9999999999 - index }));
  state.entries = [entry('income', 9999999999), entry('income', 9999999998), entry('expense', 1)];
  const summary = goalSummary(state);
  assert.equal(summary.target, 119999999922); assert.equal(summary.balance, 19999999996);
  assert.equal(summary.goals.reduce((sum, goal) => sum + goal.balance, 0), 19999999996);
  assert.ok(summary.goals.every(goal => Number.isSafeInteger(goal.balance) && goal.balance <= goal.target));
  const fund = BigInt(summary.balance), total = BigInt(summary.target);
  for (const goal of summary.goals) {
    const floor = Number(fund * BigInt(goal.target) / total);
    assert.ok(goal.balance === floor || goal.balance === floor + 1);
  }
  validateState(state);
});

test('goal allocation conserves money across a deterministic range of expenses and income', () => {
  const state = stateWithGoal(101, 0);
  state.goals.push({ id: 'goal-b', kind: 'wedding', title: 'Wedding', target: 203 },
    { id: 'goal-c', kind: 'house', title: 'Home', target: 307 });
  for (let cents = 1; cents <= 700; cents += 7) {
    state.entries = [entry('income', cents)];
    const summary = goalSummary(state), allocated = summary.goals.reduce((sum, goal) => sum + goal.balance, 0);
    assert.equal(allocated + summary.surplus, cents);
    assert.ok(summary.goals.every(goal => goal.balance >= 0 && goal.balance <= goal.target));
    state.entries.push(entry('expense', cents + 1));
    assert.equal(goalSummary(state).balance, -1);
    assert.ok(goalSummary(state).goals.every(goal => goal.balance === 0));
  }
});
