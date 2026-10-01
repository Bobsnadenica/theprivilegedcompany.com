// Every goal shares one real ledger balance. Allocations divide that money;
// moving the same money into savings never creates another contribution.
export const GOAL_PRESETS = [
  { kind: 'car', target: 3000000 },
  { kind: 'wedding', target: 5000000 },
  { kind: 'house', target: 10000000 },
  { kind: 'emergency', target: 1000000 },
  { kind: 'travel', target: 200000 },
  { kind: 'custom', target: 1000000 },
];
export const GOAL_MILESTONES = [0, .1, .25, .5, .75, 1];
const moneyLimit = 9999999999;
const amountValid = n => Number.isSafeInteger(n) && n >= 0 && n <= moneyLimit;

export function isValidGoal(goal) {
  return !!goal && typeof goal === 'object' && !Array.isArray(goal)
    && typeof goal.id === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(goal.id)
    && GOAL_PRESETS.some(preset => preset.kind === goal.kind)
    && typeof goal.title === 'string' && !!goal.title.trim() && goal.title.length <= 64
    && amountValid(goal.target) && goal.target > 0;
}

const checked = n => {
  if (!Number.isSafeInteger(n)) throw new Error('invalidSave');
  return n;
};
const progressFields = (balance, target) => {
  const ratio = Math.max(0, Math.min(1, balance / target));
  return { balance, target, ratio,
    percent: Math.floor(Math.max(0, Math.min(target, balance)) * 100 / target),
    remaining: Math.max(0, checked(target - balance)), completed: balance >= target };
};

function allocations(goals, available, target) {
  // Multiplication can exceed Number's exact integer range even when every
  // amount is valid. BigInt keeps proportional rounding exact down to one cent.
  const divisor = BigInt(target), fund = BigInt(available);
  const shares = goals.map(goal => {
    const numerator = fund * BigInt(goal.target);
    return { goal, amount: Number(numerator / divisor), remainder: numerator % divisor };
  });
  let cents = available - shares.reduce((sum, share) => sum + share.amount, 0);
  const sorted = [...shares].sort((a, b) => a.remainder === b.remainder
    ? a.goal.id < b.goal.id ? -1 : a.goal.id > b.goal.id ? 1 : 0
    : a.remainder > b.remainder ? -1 : 1);
  for (const share of sorted) {
    if (!cents) break;
    share.amount++; cents--;
  }
  return shares.map(({ goal, amount }) => ({ ...goal, ...progressFields(amount, goal.target) }));
}

export function goalSummary(state) {
  if (!Array.isArray(state.goals) || state.goals.length > 12 || state.goals.some(goal => !isValidGoal(goal))
    || new Set(state.goals.map(goal => goal.id)).size !== state.goals.length || !amountValid(state.opening)
    || !Array.isArray(state.entries) || state.entries.length > 10000) throw new Error('invalidSave');
  if (!state.goals.length) return null;
  let income = 0, expense = 0;
  for (const entry of state.entries) {
    if (!entry || !['income', 'expense', 'saving'].includes(entry.type)
      || !amountValid(entry.amount) || entry.amount === 0) throw new Error('invalidSave');
    if (entry.type === 'income') income = checked(income + entry.amount);
    if (entry.type === 'expense') expense = checked(expense + entry.amount);
  }
  const target = state.goals.reduce((sum, goal) => checked(sum + goal.target), 0);
  const balance = checked(checked(state.opening + income) - expense);
  const fields = progressFields(balance, target), { ratio } = fields;
  const milestone = GOAL_MILESTONES.reduce((index, threshold, current) => ratio >= threshold ? current : index, 0);
  return { ...fields, stage: ratio >= .75 ? 'guardian' : ratio >= .25 ? 'adventurer' : 'young',
    milestone, income, expense, surplus: Math.max(0, checked(balance - target)),
    goals: allocations(state.goals, Math.max(0, Math.min(target, balance)), target) };
}

const goalSignature = state => JSON.stringify(state.goals.map(goal => [goal.id, goal.target])
  .sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

export function goalReaction(previous, next) {
  const before = goalSummary(previous), after = goalSummary(next);
  const goalChanged = goalSignature(previous) !== goalSignature(next);
  const delta = !goalChanged && before && after ? checked(after.balance - before.balance) : 0;
  return {
    delta, direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'steady', goalChanged,
    milestoneUp: !goalChanged && !!before && !!after && after.milestone > before.milestone,
    milestoneDown: !goalChanged && !!before && !!after && after.milestone < before.milestone,
    completed: !goalChanged && !!before && !!after && !before.completed && after.completed,
    reopened: !goalChanged && !!before && !!after && before.completed && !after.completed,
  };
}
