import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, demoState, validateState, uuid } from '../src/model.js';
import { GOAL_PRESETS, GOAL_MILESTONES, goalSummary, goalReaction } from '../src/goals.js';

const date = '2026-10-01';
function stateWithGoal(target = 3000000, opening = 0) {
  const state = createState(date);
  state.goal = { id: uuid(), kind: 'car', title: 'New car', target, opening };
  return state;
}
function entry(type, amount, entryDate = date) {
  return { id: uuid(), type, amount, category: type === 'expense' ? 'other' : type,
    note: '', date: entryDate, ...(type === 'expense' ? { essential: true } : {}) };
}

test('new adventures wait for a goal and expose the requested preset amounts', () => {
  const state = createState(date);
  assert.equal(state.version, 2); assert.equal(state.goal, null); assert.equal(goalSummary(state), null);
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

test('expenses visibly reverse milestone progress, evolution, and goal completion', () => {
  const state = stateWithGoal(100000, 100000), before = structuredClone(state);
  state.entries.push(entry('expense', 80000));
  const summary = goalSummary(state), reaction = goalReaction(before, state);
  assert.equal(summary.balance, 20000); assert.equal(summary.percent, 20);
  assert.equal(summary.completed, false); assert.equal(summary.stage, 'young'); assert.equal(summary.milestone, 1);
  assert.deepEqual(reaction, { delta: -80000, direction: 'down', goalChanged: false,
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
  after.goal = { ...after.goal, id: uuid(), kind: 'travel', title: 'Summer trip', target: 10000 };
  assert.equal(after.goal.opening, 25000, 'Changing the goal preserves opening money');
  assert.equal(goalSummary(after).completed, true);
  assert.deepEqual(goalReaction(before, after), { delta: 0, direction: 'steady', goalChanged: true,
    milestoneUp: false, milestoneDown: false, completed: false, reopened: false });
  assert.equal(goalReaction(createState(date), after).completed, false);
});

test('version 1 saves migrate without changing ledger, plans, rewards, or lock revision', () => {
  const legacy = demoState(date); legacy.version = 1; delete legacy.goal;
  const original = structuredClone(legacy), migrated = validateState(legacy);
  assert.equal(migrated.version, 2); assert.equal(migrated.goal, null);
  const { version, goal, ...preserved } = migrated;
  const { version: oldVersion, ...expected } = original;
  assert.deepEqual(preserved, expected);
  assert.deepEqual(legacy, original, 'Validation does not rewrite the input save');
  assert.equal(migrated.revision, original.revision);
  assert.equal(validateState(migrated), migrated);
});

test('goal validation rejects missing fields, malformed amounts, and unsupported goal types', () => {
  const original = stateWithGoal(); validateState(original);
  for (const change of [
    s => { delete s.goal; }, s => { s.goal = []; }, s => { s.goal.id = 'invalid id'; },
    s => { s.goal.title = ' '; }, s => { s.goal.title = 'x'.repeat(65); },
    s => { s.goal.kind = 'investment'; }, s => { s.goal.target = 0; },
    s => { s.goal.target = 10000000000; }, s => { s.goal.target = 1.5; },
    s => { s.goal.opening = -1; }, s => { s.goal.opening = Number.MAX_SAFE_INTEGER; },
    s => { s.goal.opening = NaN; }, s => { delete s.goal.opening; },
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

test('demo starts with a car goal and keeps legacy money records intact', () => {
  const state = demoState(date), summary = goalSummary(state);
  assert.equal(state.version, 2); assert.equal(state.goal.kind, 'car');
  assert.equal(state.goal.opening, 730000); assert.equal(summary.target, 3000000);
  assert.equal(summary.balance, 853200); assert.equal(summary.percent, 28); assert.equal(summary.stage, 'adventurer');
  validateState(state);
});
