import { createInitialState, normalizeState } from "./state.js";
import { decodePayload, encodePayload } from "./utils.js";

const SAVE_KEY = "sugarbox-hollow-orchard-save";

export function loadGame(storage = globalThis.localStorage, now = Date.now()) {
  if (!storage) return createInitialState(now);
  try {
    const raw = storage.getItem(SAVE_KEY);
    return raw ? normalizeState(JSON.parse(raw), now) : createInitialState(now);
  } catch {
    return createInitialState(now);
  }
}

export function saveGame(state, storage = globalThis.localStorage) {
  if (!storage) return;
  storage.setItem(SAVE_KEY, JSON.stringify(state));
}

export function clearGame(storage = globalThis.localStorage) {
  if (!storage) return;
  storage.removeItem(SAVE_KEY);
}

export function exportSave(state) {
  return encodePayload(state);
}

export function importSave(text, now = Date.now()) {
  return normalizeState(decodePayload(text), now);
}

export { SAVE_KEY };
