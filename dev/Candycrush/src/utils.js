import { RESOURCE_LABELS, RESOURCE_ORDER } from "./content.js";

export function formatNumber(value) {
  const number = Math.floor(Number(value) || 0);
  if (number < 10000) return String(number);
  if (number < 1000000) return `${Math.floor(number / 100) / 10}k`;
  return `${Math.floor(number / 100000) / 10}m`;
}

export function formatCost(cost = {}) {
  const parts = RESOURCE_ORDER
    .filter((key) => cost[key])
    .map((key) => `${formatNumber(cost[key])} ${RESOURCE_LABELS[key]}`);
  return parts.length ? parts.join(", ") : "free";
}

export function addLog(state, message) {
  if (!message) return;
  state.log.push(message);
  state.log = state.log.slice(-90);
}

export function addResources(state, resources = {}, multiplier = 1) {
  for (const [key, value] of Object.entries(resources)) {
    if (!(key in state.resources)) continue;
    state.resources[key] += Math.floor(value * multiplier);
  }
}

export function hasResources(state, cost = {}) {
  return Object.entries(cost).every(([key, value]) => (state.resources[key] || 0) >= value);
}

export function spendResources(state, cost = {}) {
  if (!hasResources(state, cost)) return false;
  for (const [key, value] of Object.entries(cost)) {
    state.resources[key] -= value;
  }
  return true;
}

export function addUnlocks(state, unlocks = []) {
  for (const key of unlocks) {
    if (key in state.unlocks) state.unlocks[key] = true;
  }
}

export function addMapNodes(state, nodes = []) {
  const set = new Set(state.map.unlocked);
  for (const id of nodes) set.add(id);
  state.map.unlocked = [...set];
}

export function ownsItem(state, id) {
  return Boolean(state.inventory.items[id]);
}

export function getPurchaseCount(state, id) {
  return state.purchases[id] || 0;
}

export function visibleByRule(state, rule) {
  if (!rule) return true;
  if (rule.completedQuest && !state.quests.completed[rule.completedQuest]) return false;
  if (rule.flag && !state.flags[rule.flag]) return false;
  if (rule.unlock && !state.unlocks[rule.unlock]) return false;
  return true;
}

export function requirementMet(state, rule = {}) {
  if (rule.map && !state.map.unlocked.includes(rule.map)) return false;
  if (rule.flag && !state.flags[rule.flag]) return false;
  if (rule.completedQuest && !state.quests.completed[rule.completedQuest]) return false;
  if (rule.equipment && !Object.values(state.equipment).includes(rule.equipment) && !state.inventory.items[rule.equipment]) return false;
  if (rule.unlock && !state.unlocks[rule.unlock]) return false;
  return true;
}

export function encodePayload(payload) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
}

export function decodePayload(text) {
  return JSON.parse(decodeURIComponent(escape(atob(text.trim()))));
}
