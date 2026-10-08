import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreCircle, cleanScores } from './scoring.mjs';
const circle = (turns = 1, radius = 100, samples = 120) => Array.from({ length: samples + 1 }, (_, i) => ({ x: 200 + Math.cos(i / samples * Math.PI * 2 * turns) * radius, y: 250 + Math.sin(i / samples * Math.PI * 2 * turns) * radius }));
test('a complete circle scores consistently at different sizes and sampling rates', () => {
  for (const radius of [20, 60, 200]) for (const samples of [24, 120, 600]) assert.ok(scoreCircle(circle(1, radius, samples)).score > 99.8);
});
test('tiny, empty and invalid traces cannot produce NaN scores', () => {
  assert.equal(scoreCircle([]), null);
  assert.equal(scoreCircle(circle(1, 0)), null);
  assert.equal(scoreCircle(circle(1, 2)), null);
  assert.equal(scoreCircle([{ x: NaN, y: 2 }]), null);
});
test('open arcs, backtracking and repeated loops do not count as a perfect circle', () => {
  assert.ok(scoreCircle(circle(0.5)).score < 60);
  assert.ok(scoreCircle(circle(2)).score < 10);
  const trace = circle(0.5);
  assert.ok(scoreCircle([...trace, ...trace.toReversed()]).score < 40);
});
test('corrupt and injected storage cannot break the leaderboard', () => {
  for (const raw of ['{', '{}', 'null', '"<img>"']) assert.deepEqual(cleanScores(raw), []);
  assert.deepEqual(cleanScores('[20,"<img>",99,null,-1,101,42]'), [99,42,20]);
});
