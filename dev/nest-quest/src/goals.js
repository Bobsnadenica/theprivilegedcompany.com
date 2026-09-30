// A goal tracks the money available after all recorded income and expenses.
// Moving that same money into savings does not create another contribution.
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
    && amountValid(goal.target) && goal.target > 0 && amountValid(goal.opening);
}

const checked = n => {
  if (!Number.isSafeInteger(n)) throw new Error('invalidSave');
  return n;
};

export function goalSummary(state) {
  if (state.goal == null) return null;
  if (!isValidGoal(state.goal) || !Array.isArray(state.entries) || state.entries.length > 10000) throw new Error('invalidSave');
  let income = 0, expense = 0;
  for (const entry of state.entries) {
    if (!entry || !['income', 'expense', 'saving'].includes(entry.type)
      || !amountValid(entry.amount) || entry.amount === 0) throw new Error('invalidSave');
    if (entry.type === 'income') income = checked(income + entry.amount);
    if (entry.type === 'expense') expense = checked(expense + entry.amount);
  }
  const target = state.goal.target;
  const balance = checked(checked(state.goal.opening + income) - expense);
  const ratio = Math.max(0, Math.min(1, balance / target));
  const milestone = GOAL_MILESTONES.reduce((index, threshold, current) => ratio >= threshold ? current : index, 0);
  return {
    balance, target, ratio, percent: Math.floor(Math.max(0, Math.min(target, balance)) * 100 / target),
    remaining: Math.max(0, checked(target - balance)), completed: balance >= target,
    stage: ratio >= .75 ? 'guardian' : ratio >= .25 ? 'adventurer' : 'young',
    milestone, income, expense,
  };
}

export function goalReaction(previous, next) {
  const before = goalSummary(previous), after = goalSummary(next);
  const goalChanged = previous.goal?.id !== next.goal?.id;
  const delta = !goalChanged && before && after ? checked(after.balance - before.balance) : 0;
  return {
    delta, direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'steady', goalChanged,
    milestoneUp: !goalChanged && !!before && !!after && after.milestone > before.milestone,
    milestoneDown: !goalChanged && !!before && !!after && after.milestone < before.milestone,
    completed: !goalChanged && !!before && !!after && !before.completed && after.completed,
    reopened: !goalChanged && !!before && !!after && before.completed && !after.completed,
  };
}
