import test from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/model.js';
import { goalSummary } from '../src/goals.js';
import { VILLAGE_THRESHOLDS, villageSummary } from '../src/village-model.js';

const goal = (id, target) => ({ id, kind: 'custom', title: id, target });
const entry = (id, type, amount) => ({ id, type, amount, date: '2026-10-01', category: type === 'expense' ? 'other' : type,
  note: '', ...(type === 'expense' ? { essential: false } : {}) });

test('each of the twelve village rewards unlocks at its exact cent threshold', () => {
  assert.equal(VILLAGE_THRESHOLDS.length, 12);
  for (const [index, threshold] of VILLAGE_THRESHOLDS.entries()) {
    const at = villageSummary({ balance: threshold });
    assert.equal(at.index, index);
    assert.equal(at.level, index + 1);
    assert.equal(at.population, index + 1);
    assert.equal(at.threshold, threshold);
    assert.equal(at.complete, index === 11);
    assert.equal(at.progress, index === 11 ? 1 : 0);
    if (index) {
      const before = villageSummary({ balance: threshold - 1 });
      assert.equal(before.level, index, `one cent short of reward ${index + 1}`);
      assert.equal(before.nextThreshold, threshold);
      assert.equal(before.remaining, 1);
      assert.equal(before.complete, false);
      assert.ok(before.progress >= 0 && before.progress < 1);
    }
  }
});

test('village progress measures the current building interval, not the goal ratio', () => {
  const halfway = villageSummary({ balance: 25000, target: 18000000, ratio: 25000 / 18000000 });
  assert.equal(halfway.level, 2);
  assert.equal(halfway.threshold, 10000);
  assert.equal(halfway.nextThreshold, 40000);
  assert.equal(halfway.remaining, 15000);
  assert.equal(halfway.progress, .5);
  assert.deepEqual(halfway, villageSummary({ balance: 25000, target: 25000, ratio: 1 }));
});

test('negative money keeps the starter camp and includes the deficit in the next reward', () => {
  const deficit = villageSummary({ balance: -12000 });
  assert.equal(deficit.balance, -12000);
  assert.equal(deficit.level, 1);
  assert.equal(deficit.population, 1);
  assert.equal(deficit.progress, 0);
  assert.equal(deficit.remaining, 22000);
  assert.equal(deficit.complete, false);
  const zero = villageSummary({ balance: 0 });
  assert.equal(zero.remaining, 10000);
  assert.equal(zero.progress, 0);
});

test('completion caps the village while retaining surplus money', () => {
  const complete = villageSummary({ balance: 1210000 });
  const extra = villageSummary({ balance: 1333456 });
  for (const summary of [complete, extra]) {
    assert.equal(summary.level, 12);
    assert.equal(summary.population, 12);
    assert.equal(summary.complete, true);
    assert.equal(summary.progress, 1);
    assert.equal(summary.remaining, 0);
    assert.equal(summary.nextIndex, 11);
  }
  assert.equal(extra.balance, 1333456);
  const reopened = villageSummary({ balance: 1209999 });
  assert.equal(reopened.level, 11);
  assert.equal(reopened.remaining, 1);
  assert.equal(reopened.complete, false);
});

test('ledger income builds the village and spending reverses an unlock', () => {
  const state = createState('2026-10-01');
  state.goals = [goal('car', 3000000), goal('wedding', 5000000), goal('house', 10000000)];
  state.opening = 89999;
  const initial = villageSummary(goalSummary(state));
  assert.equal(initial.level, 3);
  assert.equal(initial.remaining, 1);
  state.entries.push(entry('income', 'income', 1));
  const built = villageSummary(goalSummary(state));
  assert.equal(built.balance, 90000);
  assert.equal(built.level, 4);
  assert.equal(built.progress, 0);
  state.entries.push(entry('expense', 'expense', 2));
  const reversed = villageSummary(goalSummary(state));
  assert.equal(reversed.balance, 89998);
  assert.equal(reversed.level, 3);
  assert.equal(reversed.remaining, 2);
  state.entries.push(entry('transfer', 'saving', 50000));
  assert.deepEqual(villageSummary(goalSummary(state)), reversed);
});

test('goal edits retain village growth and funded-goal surplus can build later rewards', () => {
  const state = createState('2026-10-01');
  state.goals = [goal('trip', 10000)];
  state.opening = 40000;
  const smallGoal = goalSummary(state);
  assert.equal(smallGoal.completed, true);
  assert.equal(smallGoal.surplus, 30000);
  const village = villageSummary(smallGoal);
  assert.equal(village.level, 3);
  state.goals.push(goal('house', 10000000));
  const largeGoal = goalSummary(state);
  assert.equal(largeGoal.completed, false);
  assert.ok(largeGoal.ratio < .01);
  assert.deepEqual(villageSummary(largeGoal), village);
  state.goals[0].target = 3000000;
  assert.deepEqual(villageSummary(goalSummary(state)), village);
});

test('missing or non-integer balances use a safe starter village', () => {
  const starter = villageSummary({ balance: 0 });
  for (const value of [undefined, null, {}, { balance: 10000.5 }, { balance: '10000' }, { balance: NaN }, { balance: Infinity }, { balance: Number.MAX_SAFE_INTEGER + 1 }]) {
    assert.deepEqual(villageSummary(value), starter);
  }
});
