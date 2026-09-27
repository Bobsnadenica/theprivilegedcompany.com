import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState, SAVE_VERSION } from "../src/state.js";
import { clearGame, exportSave, importSave, loadGame, saveGame, SAVE_KEY } from "../src/save.js";
import { renderGame } from "../src/ui.js";

class MemoryStorage {
  constructor() {
    this.map = new Map();
  }
  getItem(key) {
    return this.map.get(key) ?? null;
  }
  setItem(key, value) {
    this.map.set(key, value);
  }
  removeItem(key) {
    this.map.delete(key);
  }
}

test("save and load normalize state", () => {
  const storage = new MemoryStorage();
  const state = createInitialState(0);
  state.resources.candies = 42;
  saveGame(state, storage);

  const loaded = loadGame(storage, 100);
  assert.equal(loaded.resources.candies, 42);
  assert.equal(loaded.version, SAVE_VERSION);
  assert.equal(storage.getItem(SAVE_KEY).includes("candies"), true);
});

test("exported save can be imported", () => {
  const state = createInitialState(0);
  state.resources.lollipops = 77;
  const code = exportSave(state);
  const imported = importSave(code, 100);
  assert.equal(imported.resources.lollipops, 77);
  assert.equal(imported.map.unlocked.includes("sugarbox"), true);
});

test("blocked storage keeps the game playable and allows manual export", () => {
  const blocked = {
    getItem() { throw new Error("Blocked"); },
    setItem() { throw new Error("Quota exceeded"); },
    removeItem() { throw new Error("Blocked"); }
  };
  const state = loadGame(blocked, 100);
  assert.equal(saveGame(state, blocked), false);
  assert.equal(clearGame(blocked), false);
  assert.equal(saveGame(state, null), false);
  assert.equal(importSave(exportSave(state), 100).createdAt, 100);
  Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("SecurityError"); } });
  try {
    assert.doesNotThrow(() => loadGame());
    assert.equal(saveGame(state), false);
    assert.equal(clearGame(), false);
  } finally { delete globalThis.localStorage; }
});

test("invalid imports fail before replacing a working game", () => {
  assert.throws(() => importSave(exportSave({})), /Invalid save/);
  for (const patch of [
    { resources: [] }, { activeTab: {} }, { map: { unlocked: "not a list" } },
    { ui: { lastReveal: { toString: null } } }, { story: { journal: { recipes: { bad: {} } } } },
    { activeQuest: { id: "unknown" } }, { story: { journal: { locations: { village: null } } } }
  ]) {
    assert.throws(() => importSave(exportSave({ ...createInitialState(), ...patch })), /Invalid/);
  }
});

test("imported journal text renders as text, never markup", () => {
  const state = createInitialState();
  state.unlocks.map = true;
  state.activeTab = "journal";
  state.story.journal.locations.village = { visited: true, notes: ['<img src=x onerror="alert(1)">'] };
  state.story.journal.mysteries.example = "<script>alert(1)</script>";
  const html = renderGame(importSave(exportSave(state)));
  assert.equal(html.includes("<img"), false);
  assert.equal(html.includes("<script>"), false);
  assert.ok(html.includes("&lt;img"));
});
