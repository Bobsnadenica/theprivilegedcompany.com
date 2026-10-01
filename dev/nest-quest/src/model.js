import { isValidGoal, goalSummary } from './goals.js';
import { CATEGORIES, isValidCustomCategory, normalizeCategoryName } from './categories.js';
export { CATEGORIES } from './categories.js';

// Money is stored in integer minor units. Version 1 savings remain transfers;
// version 3 goals share income minus expenses. This is separate from portal Budget.
export const CURRENCIES = ['EUR', 'USD', 'GBP', 'BGN'];
export const QUESTS = [
  { id: 'cottage', x: 10, y: 67, xp: 50, gold: 10 },
  { id: 'lanterns', x: 25, y: 39, xp: 70, gold: 15 },
  { id: 'bridge', x: 44, y: 59, xp: 90, gold: 20 },
  { id: 'forest', x: 64, y: 39, xp: 110, gold: 25 },
  { id: 'princess', x: 82, y: 21, xp: 150, gold: 35 },
  { id: 'sanctuary', x: 90, y: 67, xp: 180, gold: 40 },
];
export const ITEMS = [
  { id: 'wildflowers', cost: 20, icon: 'flower' },
  { id: 'lantern', cost: 40, icon: 'lantern' },
  { id: 'fireflies', cost: 65, icon: 'sparkles' },
];
export const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const uuid = () => crypto.randomUUID();
export function parseMoney(value, allowZero = false) {
  const text = String(value).trim().replace(',', '.');
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(text)) throw new Error('amount');
  const [whole, fraction = ''] = text.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents < (allowZero ? 0 : 1)) throw new Error('amount');
  return cents;
}
export function validDate(value) {
  if (typeof value !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
export const validMonth = value => typeof value === 'string' && /^20\d{2}-(0[1-9]|1[0-2])$/.test(value);
const amountValid = n => Number.isSafeInteger(n) && n >= 0 && n <= 9999999999;
const idValid = s => typeof s === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(s);
export function createState(date = localDate()) {
  return { version: 3, revision: uuid(), createdAt: date, updatedAt: new Date().toISOString(), goals: [], opening: 0, customCategories: [],
    profile: { name: 'Ember', currency: 'EUR', started: false },
    entries: [], plans: {}, claims: [], checkins: [], recordDays: [], items: [], equipped: [] };
}
export function validateState(s) {
  const fail = () => { throw new Error('invalidSave'); };
  if (!s || ![1, 2, 3].includes(s.version)) fail();
  // Migration preserves every ledger record, reward, date, and lock revision.
  // Version 2's opening money belongs to the shared fund, never to each goal.
  if (s.version < 3) {
    if (s.version === 2 && (!Object.hasOwn(s, 'goal') || (s.goal !== null && (!isValidGoal(s.goal) || !amountValid(s.goal.opening))))) fail();
    const { goal, ...legacy } = s;
    const goals = s.version === 2 && goal ? [{ id: goal.id, kind: goal.kind, title: goal.title, target: goal.target }] : [];
    s = { ...legacy, version: 3, goals, opening: s.version === 2 && goal ? goal.opening : 0, customCategories: [] };
  }
  if (Object.hasOwn(s, 'goal') || !Array.isArray(s.goals) || s.goals.length > 12 || s.goals.some(goal => !isValidGoal(goal))
    || new Set(s.goals.map(goal => goal.id)).size !== s.goals.length || !amountValid(s.opening)
    || !Array.isArray(s.customCategories) || s.customCategories.length > 30
    || s.customCategories.some(category => !isValidCustomCategory(category))
    || new Set(s.customCategories.map(category => category.id)).size !== s.customCategories.length
    || new Set(s.customCategories.map(category => normalizeCategoryName(category.name))).size !== s.customCategories.length
    || !idValid(s.revision) || !validDate(s.createdAt)
    || typeof s.updatedAt !== 'string' || !Number.isFinite(Date.parse(s.updatedAt))
    || !s.profile || typeof s.profile.name !== 'string' || !s.profile.name.trim() || s.profile.name.length > 24
    || !CURRENCIES.includes(s.profile.currency) || typeof s.profile.started !== 'boolean'
    || !Array.isArray(s.entries) || s.entries.length > 10000
    || !s.plans || typeof s.plans !== 'object' || Array.isArray(s.plans) || Object.keys(s.plans).length > 1200
    || !Array.isArray(s.claims) || s.claims.length > 7200
    || !Array.isArray(s.checkins) || s.checkins.length > 10000 || !Array.isArray(s.recordDays) || s.recordDays.length > 10000
    || !Array.isArray(s.items) || !Array.isArray(s.equipped)) fail();
  const ids = new Set();
  const categoryIds = new Set([...Object.keys(CATEGORIES), ...s.customCategories.map(category => category.id)]);
  let total = 0;
  for (const e of s.entries) {
    if (!e || !idValid(e.id) || ids.has(e.id) || !validDate(e.date)
      || !['income', 'expense', 'saving'].includes(e.type) || !amountValid(e.amount) || e.amount === 0
      || typeof e.note !== 'string' || e.note.length > 160
      || (e.type === 'expense' ? !categoryIds.has(e.category) || typeof e.essential !== 'boolean' : e.category !== e.type)) fail();
    ids.add(e.id); total += e.amount;
    if (!Number.isSafeInteger(total)) fail();
  }
  for (const [month, plan] of Object.entries(s.plans)) {
    if (!validMonth(month) || !plan || !amountValid(plan.goal) || (plan.flex !== null && !amountValid(plan.flex))) fail();
  }
  const claimIds = new Set();
  for (const c of s.claims) {
    if (!c || !validMonth(c.month) || !QUESTS.some(q => q.id === c.quest) || !['kind', 'bold'].includes(c.choice)
      || !validDate(c.date) || claimIds.has(`${c.month}:${c.quest}`)) fail();
    claimIds.add(`${c.month}:${c.quest}`);
  }
  for (const days of [s.checkins, s.recordDays]) if (new Set(days).size !== days.length || days.some(d => !validDate(d))) fail();
  if (new Set(s.items).size !== s.items.length || new Set(s.equipped).size !== s.equipped.length
    || s.items.some(id => !ITEMS.some(item => item.id === id)) || s.equipped.some(id => !s.items.includes(id))) fail();
  if (progress(s).gold < 0) fail();
  goalSummary(s);
  if (new TextEncoder().encode(JSON.stringify(s)).byteLength > 2000000) fail();
  return s;
}
export function summarize(state, month) {
  const entries = state.entries.filter(e => e.date.startsWith(`${month}-`)).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const result = { income: 0, expense: 0, saving: 0, essentials: 0, flexible: 0, categories: {}, entries };
  for (const e of entries) {
    result[e.type] += e.amount;
    if (e.type === 'expense') {
      result[e.essential ? 'essentials' : 'flexible'] += e.amount;
      result.categories[e.category] = (result.categories[e.category] || 0) + e.amount;
    }
  }
  const plan = state.plans[month] || { goal: 0, flex: null };
  result.goal = plan.goal;
  result.flexLimit = plan.flex ?? Math.max(0, result.income - result.essentials - result.goal);
  result.remaining = result.income - result.expense - result.saving;
  result.goalProgress = result.goal > 0 ? Math.min(1, result.saving / result.goal) : 0;
  result.storm = result.remaining < 0 || (result.income > 0 && result.flexible > result.flexLimit);
  return result;
}
export function progress(state) {
  // Reward a logging day once. Correcting/deleting a financial entry must not
  // take away an earned decoration or make its coin balance negative.
  const loggedDays = state.recordDays.length;
  let xp = loggedDays * 10 + state.checkins.length * 15;
  let gold = loggedDays * 2 + state.checkins.length * 3;
  let kindness = 0, courage = 0;
  for (const c of state.claims) {
    const quest = QUESTS.find(q => q.id === c.quest);
    if (!quest) continue;
    xp += quest.xp; gold += quest.gold;
    if (c.choice === 'kind') kindness += 2;
    else courage += 2;
  }
  gold -= state.items.reduce((total, id) => total + (ITEMS.find(item => item.id === id)?.cost || 0), 0);
  const level = Math.min(50, Math.floor(Math.sqrt(xp / 40)) + 1);
  const floor = (level - 1) ** 2 * 40, ceiling = level ** 2 * 40;
  return { xp, gold, level, kindness, courage, loggedDays, stage: level >= 5 ? 'guardian' : level >= 3 ? 'adventurer' : 'young',
    levelProgress: Math.min(1, (xp - floor) / (ceiling - floor)), nextXp: ceiling };
}
export function questStatus(state, month, index) {
  const q = QUESTS[index], summary = summarize(state, month);
  const complete = state.claims.some(c => c.month === month && c.quest === q.id);
  const previous = index === 0 || state.claims.some(c => c.month === month && c.quest === QUESTS[index - 1].id);
  const savings = target => ({ key: 'saveGoal', value: summary.goal > 0 ? Math.min(summary.saving, Math.ceil(summary.goal * target)) : 0,
    target: summary.goal > 0 ? Math.ceil(summary.goal * target) : 1, ratio: target, money: true, needsGoal: summary.goal === 0 });
  const checks = [
    [{ key: 'recordIncome', value: summary.income > 0 ? 1 : 0, target: 1 }, { key: 'recordExpense', value: summary.expense > 0 ? 1 : 0, target: 1 }, { key: 'setGoal', value: summary.goal > 0 ? 1 : 0, target: 1 }],
    [{ key: 'threeCategories', value: Math.min(Object.keys(summary.categories).length, 3), target: 3 }],
    [savings(.25)],
    [savings(.5), { key: 'careDays', value: Math.min(state.checkins.length, 2), target: 2 }],
    [savings(1)],
    [savings(1), { key: 'careDays', value: Math.min(state.checkins.length, 3), target: 3 }],
  ][index];
  return { ...q, complete, locked: !previous, checks, ready: !complete && previous && checks.every(c => !c.needsGoal && c.value >= c.target) };
}
export function claimQuest(state, month, questId, choice, date = localDate()) {
  const index = QUESTS.findIndex(q => q.id === questId);
  if (index < 0 || !['kind', 'bold'].includes(choice) || !validDate(date) || !questStatus(state, month, index).ready) throw new Error('questNotReady');
  state.claims.push({ month, quest: questId, choice, date });
}
export function buyItem(state, id) {
  const item = ITEMS.find(i => i.id === id);
  if (!item || state.items.includes(id) || progress(state).gold < item.cost) throw new Error('notEnoughGold');
  state.items.push(id); state.equipped.push(id);
}
export function streak(state, today = localDate()) {
  const set = new Set(state.checkins);
  const day = new Date(`${today}T12:00:00`);
  if (!set.has(today)) day.setDate(day.getDate() - 1);
  let count = 0;
  while (set.has(localDate(day))) { count++; day.setDate(day.getDate() - 1); }
  return count;
}
export function demoState(today = localDate()) {
  const s = createState(today), month = today.slice(0, 7);
  s.profile = { name: 'Ember', currency: 'EUR', started: true };
  s.goals = [
    { id: uuid(), kind: 'car', title: 'New car', target: 3000000 },
    { id: uuid(), kind: 'wedding', title: 'Wedding', target: 5000000 },
    { id: uuid(), kind: 'house', title: 'New home', target: 10000000 },
  ];
  s.opening = 730000;
  s.plans[month] = { goal: 30000, flex: 55000 };
  const entry = (type, amount, category, note, essential = true) => ({ id: uuid(), date: `${month}-01`, type, amount, category, note, ...(type === 'expense' ? { essential } : {}) });
  s.entries = [entry('income', 240000, 'income', 'Monthly salary'), entry('expense', 75000, 'housing', 'A cozy place to live'),
    entry('expense', 18500, 'groceries', 'Groceries'), entry('expense', 9600, 'bills', 'Electricity & internet'),
    entry('expense', 4500, 'transport', 'Monthly pass'), entry('expense', 6800, 'dining', 'Dinner with friends', false),
    entry('expense', 2400, 'subscriptions', 'Music & movies', false), entry('saving', 9000, 'saving', 'A little future security')];
  s.checkins = [today]; s.recordDays = [`${month}-01`];
  s.claims = [{ month, quest: 'cottage', choice: 'kind', date: today }, { month, quest: 'lanterns', choice: 'kind', date: today }];
  return s;
}
export function csv(state, month) {
  const cell = v => {
    let text = String(v);
    if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return [['Date', 'Type', 'Category', 'Amount', 'Currency', 'Essential', 'Note'], ...summarize(state, month).entries.map(e =>
    [e.date, e.type, e.category, (e.amount / 100).toFixed(2), state.profile.currency, e.type === 'expense' ? String(e.essential) : '', e.note])].map(row => row.map(cell).join(',')).join('\r\n');
}
