export const VILLAGE_THRESHOLDS = Object.freeze([0, 10000, 40000, 90000, 160000, 250000, 360000, 490000, 640000, 810000, 1000000, 1210000]);

// Levels derive from actual available money; corrections reverse them naturally.
export function villageSummary(total) {
  const balance = Number.isSafeInteger(total?.balance) ? total.balance : 0;
  const index = VILLAGE_THRESHOLDS.reduce((current, threshold, i) => balance >= threshold ? i : current, 0);
  const complete = index === VILLAGE_THRESHOLDS.length - 1;
  const threshold = VILLAGE_THRESHOLDS[index];
  const nextThreshold = complete ? threshold : VILLAGE_THRESHOLDS[index + 1];
  return { balance, index, level: index + 1, population: index + 1, threshold, nextThreshold,
    remaining: Math.max(0, nextThreshold - balance), complete,
    progress: complete ? 1 : Math.max(0, Math.min(1, (balance - threshold) / (nextThreshold - threshold))),
    nextIndex: complete ? index : index + 1 };
}
