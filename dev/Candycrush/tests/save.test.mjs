import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState, SAVE_VERSION } from "../src/state.js";
import { exportSave, importSave, loadGame, saveGame, SAVE_KEY } from "../src/save.js";

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
