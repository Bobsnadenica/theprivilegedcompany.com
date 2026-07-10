import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState } from "../src/state.js";
import {
  answerRiddle,
  buyShopItem,
  dropCandies,
  eatCandies,
  OFFLINE_CAP_SECONDS,
  plantLollipops,
  repairBridge,
  tickState
} from "../src/economy.js";

test("candies accrue at the base rate and offline progress is capped", () => {
  const state = createInitialState(0);
  tickState(state, 5000);
  assert.equal(Math.floor(state.resources.candies), 5);

  tickState(state, (OFFLINE_CAP_SECONDS + 60) * 1000 + 5000);
  assert.equal(Math.floor(state.resources.candies), 5 + OFFLINE_CAP_SECONDS);
  assert.equal(state.stats.offlineSeconds, 60);
});

test("early actions reveal shop and inventory", () => {
  const state = createInitialState(0);
  state.resources.candies = 35;
  dropCandies(state);
  assert.equal(state.unlocks.shop, true);
  eatCandies(state);
  assert.equal(state.stats.candiesEaten, 25);
  assert.equal(state.unlocks.inventory, true);
});

test("shop purchases unlock map, farm, and equipment", () => {
  const state = createInitialState(0);
  state.resources.candies = 1000;
  assert.equal(buyShopItem(state, "paperMap"), true);
  assert.equal(state.unlocks.map, true);
  assert.ok(state.map.unlocked.includes("village"));

  assert.equal(buyShopItem(state, "tinSpoon"), true);
  assert.equal(state.equipment.weapon, "tinSpoon");
  assert.equal(state.unlocks.quests, true);

  assert.equal(buyShopItem(state, "starterPlot"), true);
  assert.equal(state.farm.plots, 1);
  assert.equal(state.unlocks.farm, true);
});

test("farm planting and bridge repair consume resources and unlock road", () => {
  const state = createInitialState(0);
  state.farm.plots = 1;
  state.resources.lollipops = 250;
  assert.equal(plantLollipops(state, 100), true);
  assert.equal(state.farm.planted, 100);
  assert.equal(state.resources.lollipops, 150);

  state.resources.candies = 500;
  state.resources.lollipops = 120;
  assert.equal(repairBridge(state), true);
  assert.equal(state.flags.bridgeRepaired, true);
  assert.ok(state.map.unlocked.includes("whisperingForest"));
});

test("riddle answers advance forest puzzle and pay rewards", () => {
  const state = createInitialState(0);
  assert.equal(answerRiddle(state, "candy"), true);
  assert.equal(state.puzzles.riddleStep, 1);
  assert.equal(state.resources.candies, 80);
  assert.equal(answerRiddle(state, "wrong"), false);
  assert.equal(state.puzzles.riddleStep, 1);
});
