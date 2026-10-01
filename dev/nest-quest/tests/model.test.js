import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, demoState, parseMoney, validateState, summarize, progress, questStatus, claimQuest, buyItem, validDate, streak, csv, uuid } from '../src/model.js';
const date = '2026-09-30', month = '2026-09';
function entry(type, amount, category = type, essential = false, entryDate = date) {
  return { id: uuid(), type, amount, category, note: '', date: entryDate, ...(type === 'expense' ? { essential } : {}) };
}
test('money parsing is decimal-exact and accepts comma input', () => {
  assert.equal(parseMoney('0.29'), 29); assert.equal(parseMoney('100,05'), 10005);
  assert.equal(parseMoney('0', true), 0);
  for (const value of ['0', '-1', '1e3', '2.333', 'NaN', '', '100000000', '1,000.00']) assert.throws(() => parseMoney(value));
});
test('dates reject rollover and unsupported years', () => {
  assert.equal(validDate('2024-02-29'), true); assert.equal(validDate('2026-02-29'), false);
  for (const value of ['2026-04-31', '2026-13-01', '2026-1-01', null, '1999-01-01']) assert.equal(validDate(value), false);
});
test('monthly totals use explicit transfers, separate essentials, and do not mix months', () => {
  const s = createState(date); s.plans[month] = { goal: 10000, flex: null };
  s.entries = [entry('income', 100000), entry('expense', 40000, 'housing', true), entry('expense', 5000, 'fun'), entry('saving', 2500), entry('income', 900000, 'income', false, '2026-10-01')];
  const summary = summarize(s, month);
  assert.deepEqual([summary.income, summary.expense, summary.saving, summary.remaining, summary.essentials, summary.flexible, summary.flexLimit], [100000, 45000, 2500, 52500, 40000, 5000, 50000]);
  assert.equal(summary.goalProgress, .25);
  s.entries = s.entries.filter(e => e.type !== 'saving');
  assert.equal(summarize(s, month).goalProgress, 0, 'Unspent income is not savings');
});
test('any category can be essential; manual flexible limits are respected', () => {
  const s = createState(date); s.plans[month] = { goal: 20000, flex: 10000 };
  s.entries = [entry('income', 100000), entry('expense', 60000, 'other', true), entry('expense', 10001, 'housing', false)];
  const summary = summarize(s, month);
  assert.equal(summary.essentials, 60000); assert.equal(summary.flexible, 10001); assert.equal(summary.storm, true);
});
test('an expense before income has no automatic flex penalty; deficit is still visible', () => {
  const s = createState(date); s.entries = [entry('expense', 5000, 'groceries', true)];
  assert.equal(summarize(s, month).remaining, -5000); assert.equal(summarize(s, month).storm, true);
});
test('zero goal cannot unlock savings missions', () => {
  const s = demoState(date); s.plans[month].goal = 0;
  assert.equal(questStatus(s, month, 2).ready, false);
  assert.equal(questStatus(s, month, 2).checks[0].needsGoal, true);
});
test('chapter claims require prerequisites and cannot be farmed', () => {
  const s = demoState(date);
  assert.equal(questStatus(s, month, 2).ready, true);
  assert.throws(() => claimQuest(s, month, 'princess', 'kind', date));
  claimQuest(s, month, 'bridge', 'bold', date);
  assert.equal(questStatus(s, month, 2).complete, true);
  assert.throws(() => claimQuest(s, month, 'bridge', 'bold', date));
  assert.equal(progress(s).courage, 2);
});
test('six chapters and princess rescue unlock through savings and real care days', () => {
  const s = demoState(date); s.entries.push(entry('saving', 21000));
  claimQuest(s, month, 'bridge', 'kind', date);
  assert.equal(questStatus(s, month, 3).ready, false);
  s.checkins.push('2026-09-29'); claimQuest(s, month, 'forest', 'kind', date);
  claimQuest(s, month, 'princess', 'bold', date);
  assert.equal(questStatus(s, month, 5).ready, false);
  s.checkins.push('2026-09-28'); claimQuest(s, month, 'sanctuary', 'kind', date);
  assert.equal(s.claims.length, 6); assert.equal(progress(s).stage, 'guardian'); validateState(s);
});
test('a new month resets its story and goal while preserving companion growth', () => {
  const s = demoState(date); claimQuest(s, month, 'bridge', 'kind', date);
  const xp = progress(s).xp;
  assert.equal(questStatus(s, '2026-10', 0).complete, false); assert.equal(summarize(s, '2026-10').goal, 0);
  assert.equal(progress(s).xp, xp);
});
test('a difficult month does not erase completed chapters or experience', () => {
  const s = demoState(date), before = progress(s);
  s.entries.push(entry('expense', 999999, 'shopping', false));
  assert.equal(summarize(s, month).storm, true); assert.equal(progress(s).xp, before.xp);
  assert.equal(questStatus(s, month, 0).complete, true);
});
test('coins are earned once per recorded day and spent once per decoration', () => {
  const s = demoState(date), coins = progress(s).gold;
  buyItem(s, 'wildflowers'); assert.equal(progress(s).gold, coins - 20);
  assert.throws(() => buyItem(s, 'wildflowers')); assert.throws(() => buyItem(s, 'fireflies'));
  s.entries = []; assert.equal(progress(s).gold, coins - 20, 'Correcting financial records does not remove earned rewards');
  validateState(s);
});
test('care streak uses local calendar dates and allows today to remain unfinished', () => {
  const s = createState(date); s.checkins = ['2026-09-28', '2026-09-29'];
  assert.equal(streak(s, date), 2); s.checkins.push(date); assert.equal(streak(s, date), 3);
  assert.equal(streak(s, '2026-10-02'), 0);
});
test('invalid backups cannot replace a valid adventure', () => {
  const s = demoState(date); validateState(s);
  for (const change of [
    x => { x.version = 5; }, x => { x.entries[0].amount = 1.1; }, x => { x.entries[0].amount = -3; },
    x => { x.entries.push({ ...x.entries[0] }); }, x => { x.claims.push({ ...x.claims[0] }); },
    x => { x.checkins.push(x.checkins[0]); }, x => { x.recordDays.push(x.recordDays[0]); },
    x => { x.profile.currency = 'BTC'; }, x => { x.entries[1].category = '__proto__'; },
    x => { x.plans['wrong'] = { goal: 1, flex: null }; }, x => { x.equipped.push('lantern'); },
    x => { x.entries[0].note = 'x'.repeat(161); }, x => { x.createdAt = 'yesterday'; },
    x => { delete x.holdings; }, x => { x.holdings = null; },
    x => { delete x.investmentTrades; }, x => { x.investmentTrades = {}; },
    x => { delete x.liabilities; }, x => { x.liabilities = '0'; },
  ]) { const copy = structuredClone(s); change(copy); assert.throws(() => validateState(copy)); }
});
test('CSV exports only the selected month and neutralizes formulas in notes', () => {
  const s = createState(date); const e = entry('income', 1299); e.note = '=HYPERLINK("evil")'; s.entries = [e, entry('income', 1, 'income', false, '2026-10-01')];
  const output = csv(s, month); assert.match(output, /12\.99/); assert.match(output, /'\=HYPERLINK\(""evil""\)/); assert.doesNotMatch(output, /2026-10-01/);
});
