import { createInitialState, normalizeState } from "./state.js?v=20260927b";
import { decodePayload, encodePayload } from "./utils.js?v=20260927b";

const SAVE_KEY = "sugarbox-hollow-orchard-save";

function browserStorage() {
  try { return globalThis.localStorage; } catch { return null; }
}

export function loadGame(storage = browserStorage(), now = Date.now()) {
  if (!storage) return createInitialState(now);
  try {
    const raw = storage.getItem(SAVE_KEY);
    return raw ? normalizeState(JSON.parse(raw), now) : createInitialState(now);
  } catch {
    return createInitialState(now);
  }
}

export function saveGame(state, storage = browserStorage()) {
  try {
    if (!storage) return false;
    storage.setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch { return false; }
}

export function clearGame(storage = browserStorage()) {
  try {
    if (!storage) return false;
    storage.removeItem(SAVE_KEY);
    return true;
  } catch { return false; }
}

export function exportSave(state) {
  return encodePayload(state);
}

export function importSave(text, now = Date.now()) {
  if (typeof text !== "string" || text.length > 1000000) throw new Error("Invalid save code");
  const data = decodePayload(text);
  if (!data || !Number.isInteger(data.version) || data.version < 1 || data.version > 3 || !data.resources) {
    throw new Error("Invalid save code");
  }
  return normalizeState(data, now);
}

export { SAVE_KEY };
