import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState, normalizeState } from "../src/state.js";
import { buyShopItem, inspectBox, listenBox, refreshUnlocks, shakeBox } from "../src/economy.js";
import {
  getAvailableCommands,
  getFoggedMapNodes,
  getVisibleResources,
  getVisibleSurfaces,
  updateProgression
} from "../src/progression.js";

test("empty save shows only the box surface and candy resource", () => {
  const state = createInitialState(0);
  assert.deepEqual(getVisibleSurfaces(state), ["box"]);
  assert.deepEqual(getVisibleResources(state), ["candies"]);
  assert.deepEqual(getAvailableCommands(state).map((command) => command.id), ["inspect-box"]);
});

test("micro discoveries reveal early commands without exposing full chrome", () => {
  const state = createInitialState(0);
  inspectBox(state);
  state.resources.candies = 6;

  const commandIds = getAvailableCommands(state).map((command) => command.id);
  assert.ok(commandIds.includes("listen-box"));
  assert.ok(commandIds.includes("shake-box"));
  assert.ok(commandIds.includes("eat"));
  assert.equal(commandIds.some((id) => id.startsWith("tab:")), false);

  listenBox(state);
  shakeBox(state);
  assert.equal(state.flags.boxListened, true);
  assert.equal(state.flags.boxShaken, true);
});

test("surfaces reveal at intended milestones", () => {
  const state = createInitialState(0);
  inspectBox(state);
  state.resources.candies = 5000;
  refreshUnlocks(state);

  assert.ok(getAvailableCommands(state).some((command) => command.id === "tab:shop"));
  buyShopItem(state, "statusRibbon");
  assert.ok(getVisibleSurfaces(state).includes("inventory"));

  buyShopItem(state, "paperMap");
  assert.ok(getVisibleSurfaces(state).includes("map"));

  buyShopItem(state, "tinSpoon");
  assert.ok(getVisibleSurfaces(state).includes("quests"));

  buyShopItem(state, "starterPlot");
  assert.ok(getVisibleSurfaces(state).includes("farm"));
});

test("surface commands include box as the way back", () => {
  const state = createInitialState(0);
  inspectBox(state);
  state.resources.candies = 500;
  refreshUnlocks(state);
  buyShopItem(state, "statusRibbon");

  const commandIds = getAvailableCommands(state).map((command) => command.id);
  assert.ok(commandIds.includes("tab:box"));
  assert.ok(commandIds.includes("tab:shop"));
  assert.ok(commandIds.includes("tab:inventory"));
});

test("existing v1-style saves migrate discovered UI from gameplay progress", () => {
  const migrated = normalizeState({
    version: 1,
    activeTab: "map",
    resources: { candies: 100, lollipops: 3 },
    unlocks: { shop: true, inventory: true, map: true, quests: true },
    map: { current: "village", unlocked: ["sugarbox", "village"], visited: { sugarbox: true, village: true } },
    inventory: { items: { bareHands: 1, tinSpoon: 1 }, potions: {}, spells: [] },
    equipment: { weapon: "tinSpoon" },
    stats: {},
    flags: {},
    purchases: {},
    farm: {},
    quests: { completed: {} },
    puzzles: {}
  }, 100);

  assert.equal(migrated.version, 3);
  assert.ok(getVisibleSurfaces(migrated).includes("map"));
  assert.ok(getVisibleSurfaces(migrated).includes("journal"));
  assert.ok(getVisibleSurfaces(migrated).includes("quests"));
  assert.ok(getVisibleResources(migrated).includes("lollipops"));
});

test("map shows fogged future nodes without making them clickable", () => {
  const state = createInitialState(0);
  state.unlocks.map = true;
  state.map.unlocked.push("village", "brokenBridge");
  updateProgression(state);
  const nodes = getFoggedMapNodes(state);
  assert.ok(nodes.some((node) => node.fogged));
  assert.equal(nodes.find((node) => node.id === "village").fogged, false);
});
