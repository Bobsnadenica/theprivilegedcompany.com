export const BALANCE_MILESTONES = {
  early: {
    seconds: 180,
    expected: { candies: [80, 450], lollipops: [0, 120] }
  },
  midgame: {
    seconds: 1800,
    expected: { candies: [500, 5000], lollipops: [200, 5000], sugarGlass: [0, 12] }
  },
  late: {
    seconds: 5400,
    expected: { candies: [2000, 20000], lollipops: [1000, 30000], moonSalt: [0, 30], prismSeeds: [0, 30] }
  },
  endgame: {
    seconds: 10800,
    expected: { candies: [5000, 80000], lollipops: [3000, 90000], dragonCaramel: [0, 12] }
  }
};

export function expectedRange(stage, resource) {
  return BALANCE_MILESTONES[stage]?.expected?.[resource] || [0, Number.POSITIVE_INFINITY];
}

export function isWithinExpectedBand(stage, resource, value) {
  const [min, max] = expectedRange(stage, resource);
  return value >= min && value <= max;
}

export function estimateFarmCapacity(plots, upgrades) {
  return Math.max(0, plots) * 1000 + Math.max(0, upgrades) * 350;
}

export function estimateLollipopRate(planted, upgrades, overclocked = false) {
  const softness = Math.max(0.28, 1 - Math.max(0, planted - 2500) / 9000);
  const base = planted * (0.018 + upgrades * 0.006) * softness;
  return base * (overclocked ? 2.4 : 1);
}

export function summarizeOfflineGain(gain) {
  const parts = [];
  if (gain.candies) parts.push(`${Math.floor(gain.candies)} candies arrived`);
  if (gain.lollipops) parts.push(`${Math.floor(gain.lollipops)} lollipops grew`);
  if (gain.chocolateBars) parts.push(`${Math.floor(gain.chocolateBars)} chocolate bars cooled`);
  return parts.length ? parts.join(", ") : "The box waited quietly.";
}
