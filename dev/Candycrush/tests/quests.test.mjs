import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState } from "../src/state.js";
import { availableQuests, runQuestToEnd, startQuest, tickQuest, usePotion } from "../src/quests.js";

test("quests are gated by requirements", () => {
  const state = createInitialState(0);
  assert.equal(availableQuests(state).length, 0);
  state.map.unlocked.push("village");
  state.inventory.items.tinSpoon = 1;
  state.equipment.weapon = "tinSpoon";
  assert.ok(availableQuests(state).some((quest) => quest.id === "trainingMeadow"));
});

test("quest completion pays rewards and first-time unlocks", () => {
  const state = createInitialState(0);
  state.map.unlocked.push("village");
  state.inventory.items.tinSpoon = 1;
  state.equipment.weapon = "tinSpoon";
  state.inventory.potions.health = 2;

  assert.equal(runQuestToEnd(state, "trainingMeadow", { autoPotions: true }), true);
  assert.equal(state.quests.completed.trainingMeadow, 1);
  assert.equal(state.unlocks.forge, true);
  assert.ok(state.resources.candies >= 180);
});

test("potions affect an active quest", () => {
  const state = createInitialState(0);
  state.map.unlocked.push("village");
  state.inventory.items.tinSpoon = 1;
  state.equipment.weapon = "tinSpoon";
  state.inventory.potions.turtle = 1;

  assert.equal(startQuest(state, "trainingMeadow"), true);
  assert.equal(usePotion(state, "turtle"), true);
  assert.equal(state.activeQuest.buffs.turtle, 8);
  tickQuest(state);
  assert.ok(state.activeQuest.buffs.turtle < 8 || state.activeQuest === null);
});
