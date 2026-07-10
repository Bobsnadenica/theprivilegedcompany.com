import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState } from "../src/state.js";
import {
  answerRiddle,
  buyShopItem,
  pushLighthouseColor,
  repairBridge,
  stepCave
} from "../src/economy.js";
import { brewRecipe, craftForgeRecipe } from "../src/crafting.js";
import { runQuestToEnd } from "../src/quests.js";

test("complete v1 progression can reach the endgame", () => {
  const state = createInitialState(0);

  grant(state, { candies: 4000, lollipops: 5000, chocolateBars: 5 });
  assert.equal(buyShopItem(state, "statusRibbon"), true);
  assert.equal(buyShopItem(state, "paperMap"), true);
  assert.equal(buyShopItem(state, "tinSpoon"), true);
  assert.equal(buyShopItem(state, "paperApron"), true);
  assert.equal(buyShopItem(state, "starterPlot"), true);
  assert.equal(buyShopItem(state, "beginnersGrimoire"), true);
  assert.equal(buyShopItem(state, "cauldronPermit"), true);

  stockPotions(state);
  assert.equal(runQuestToEnd(state, "trainingMeadow", { autoPotions: true }), true);
  grant(state, { candies: 2000, chocolateBars: 2 });
  assert.equal(craftForgeRecipe(state, "caramelDagger"), true);

  grant(state, { candies: 1000, lollipops: 500 });
  assert.equal(repairBridge(state), true);
  assert.equal(answerRiddle(state, "candy"), true);
  assert.equal(answerRiddle(state, "x"), true);
  assert.equal(answerRiddle(state, "planks"), true);

  stockPotions(state);
  assert.equal(runQuestToEnd(state, "forestAmbush", { autoPotions: true }), true);
  grant(state, { candies: 2000, lollipops: 1200, sugarGlass: 4 });
  assert.equal(craftForgeRecipe(state, "syrupMail"), true);

  for (const step of ["north", "east", "east", "south", "west"]) {
    assert.equal(stepCave(state, step), true);
  }
  grant(state, { sugarGlass: 8, moonSalt: 4, chocolateBars: 4 });
  assert.equal(craftForgeRecipe(state, "glassBlade"), true);

  stockPotions(state);
  assert.equal(runQuestToEnd(state, "caveMaze", { autoPotions: true }), true);
  for (const color of ["red", "blue", "blue", "green"]) {
    assert.equal(pushLighthouseColor(state, color), true);
  }

  stockPotions(state);
  assert.equal(runQuestToEnd(state, "seaDive", { autoPotions: true }), true);
  grant(state, { sugarGlass: 10, moonSalt: 8, prismSeeds: 8 });
  assert.equal(craftForgeRecipe(state, "glassCloak"), true);

  stockPotions(state);
  assert.equal(runQuestToEnd(state, "desertCaravan", { autoPotions: true }), true);
  stockPotions(state);
  assert.equal(runQuestToEnd(state, "fortressRooms", { autoPotions: true }), true);
  grant(state, { sugarGlass: 10, prismSeeds: 10, dragonCaramel: 2 });
  assert.equal(craftForgeRecipe(state, "prismCharm"), true);

  stockPotions(state);
  assert.equal(runQuestToEnd(state, "licoriceKeep", { autoPotions: true }), true);
  grant(state, { moonSalt: 20, prismSeeds: 20, dragonCaramel: 5 });
  assert.equal(craftForgeRecipe(state, "moonFork"), true);

  stockPotions(state);
  assert.equal(runQuestToEnd(state, "finalOrchard", { autoPotions: true }), true);
  assert.equal(state.unlocks.endgame, true);
  assert.equal(state.unlocks.developer, true);
});

function grant(state, resources) {
  for (const [key, value] of Object.entries(resources)) {
    state.resources[key] += value;
  }
}

function stockPotions(state) {
  grant(state, { candies: 2000, lollipops: 2000, sugarGlass: 3, moonSalt: 3, prismSeeds: 3 });
  for (let i = 0; i < 3; i += 1) brewRecipe(state, "health");
  for (let i = 0; i < 2; i += 1) brewRecipe(state, "turtle");
  brewRecipe(state, "quicksilver");
  brewRecipe(state, "starfire");
}
