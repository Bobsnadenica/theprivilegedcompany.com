import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState } from "../src/state.js";
import { brewRecipe, craftForgeRecipe } from "../src/crafting.js";

test("forge recipes create and equip gear once", () => {
  const state = createInitialState(0);
  state.quests.completed.trainingMeadow = 1;
  state.resources.candies = 600;
  state.resources.chocolateBars = 1;

  assert.equal(craftForgeRecipe(state, "caramelDagger"), true);
  assert.equal(state.inventory.items.caramelDagger, 1);
  assert.equal(state.equipment.weapon, "caramelDagger");
  assert.equal(craftForgeRecipe(state, "caramelDagger"), false);
});

test("cauldron recipes consume resources and produce potions", () => {
  const state = createInitialState(0);
  state.resources.candies = 250;

  assert.equal(brewRecipe(state, "health"), true);
  assert.equal(state.inventory.potions.health, 1);
  assert.equal(state.resources.candies, 130);
});
