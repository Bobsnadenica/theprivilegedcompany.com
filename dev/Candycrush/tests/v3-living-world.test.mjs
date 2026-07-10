import test from "node:test";
import assert from "node:assert/strict";
import {
  CAULDRON_RECIPES,
  FORGE_RECIPES,
  LOCATION_DETAILS,
  QUESTS,
  RIDDLES,
  WISHES
} from "../src/content.js";
import {
  estimateFarmCapacity,
  estimateLollipopRate,
  expectedRange,
  isWithinExpectedBand,
  summarizeOfflineGain
} from "../src/balance.js";
import { createInitialState, normalizeState } from "../src/state.js";
import { runQuestToEnd } from "../src/quests.js";
import { createQuestRun, tickQuestRun } from "../src/questTypes.js";
import { buyRumor, getJournalSummary, inspectLocation, triggerSecret } from "../src/story.js";

test("v3 content targets are present", () => {
  assert.equal(QUESTS.length, 16);
  assert.equal(RIDDLES.length, 12);
  assert.equal(CAULDRON_RECIPES.length, 10);
  assert.equal(FORGE_RECIPES.length, 12);
  assert.equal(WISHES.length, 8);
  assert.equal(Object.keys(LOCATION_DETAILS).length, 14);
  assert.ok(Object.values(LOCATION_DETAILS).every((details) => details.length >= 2 && details.length <= 4));
});

test("balance helpers expose expected bands and farm soft caps", () => {
  assert.deepEqual(expectedRange("early", "candies"), [80, 450]);
  assert.equal(isWithinExpectedBand("midgame", "lollipops", 1200), true);
  assert.equal(isWithinExpectedBand("late", "moonSalt", 80), false);
  assert.equal(estimateFarmCapacity(2, 3), 3050);
  assert.ok(estimateLollipopRate(5000, 1) < estimateLollipopRate(2500, 1) * 2.1);
  assert.equal(summarizeOfflineGain({ candies: 12.7, lollipops: 3.2, chocolateBars: 1 }), "12 candies arrived, 3 lollipops grew, 1 chocolate bars cooled");
});

test("v2 saves migrate into v3 story and journal state", () => {
  const migrated = normalizeState(
    {
      version: 2,
      unlocks: { map: true, developer: true, endgame: true },
      map: { current: "hollowOrchard", unlocked: ["sugarbox", "village", "hollowOrchard"], visited: {} },
      quests: { completed: { finalOrchard: 1 } },
      resources: { candies: 1 },
      inventory: { items: { bareHands: 1 }, potions: {}, spells: [] },
      equipment: { weapon: "bareHands" },
      stats: {},
      flags: {},
      purchases: {},
      farm: {},
      puzzles: {}
    },
    100
  );

  const journal = getJournalSummary(migrated);
  assert.equal(migrated.version, 3);
  assert.ok(journal.locations.some(([id]) => id === "hollowOrchard"));
  assert.ok(journal.quests.some((quest) => quest.name === "finalOrchard"));
  assert.ok(journal.endings.some((ending) => ending.label === "The Hollow Orchard"));
});

test("journal actions track rumors, inspectable details, and behavior secrets", () => {
  const state = createInitialState(0);
  state.map.unlocked.push("village");
  state.resources.lollipops = 200;
  state.stats.candiesDropped = 100;

  assert.equal(inspectLocation(state, "village"), true);
  assert.equal(buyRumor(state), true);
  assert.equal(triggerSecret(state, "groundMouth"), true);

  const journal = getJournalSummary(state);
  assert.ok(journal.locations.some(([id, entry]) => id === "village" && entry.notes.length === 1));
  assert.equal(journal.rumors.length, 1);
  assert.equal(state.story.knownSecrets.groundMouth, true);
  assert.ok(state.resources.moonSalt >= 1);
});

test("quest v2 runners handle exploration, survival, puzzle, boss phases, and optional endings", () => {
  const state = createInitialState(0);
  state.map.unlocked.push("village");
  assert.equal(runQuestToEnd(state, "shopkeeperErrand"), true);
  assert.equal(state.quests.completed.shopkeeperErrand, 1);

  state.unlocks.farm = true;
  assert.equal(runQuestToEnd(state, "farmUnderRoots"), true);
  assert.equal(state.quests.completed.farmUnderRoots, 1);

  state.flags.bridgeRepaired = true;
  assert.equal(runQuestToEnd(state, "bridgeEchoes"), true);
  assert.equal(state.quests.completed.bridgeEchoes, 1);

  state.quests.completed.desertCaravan = 1;
  assert.equal(runQuestToEnd(state, "moonWellBargain"), true);
  assert.equal(state.story.endings.moon.label, "The Moon Well Bargain");
  assert.equal(state.unlocks.endgame, true);

  const boss = QUESTS.find((quest) => quest.id === "fortressAnnex");
  const active = createQuestRun(boss, { maxHp: 500, attack: 180, defense: 40 });
  let completed = false;
  for (let i = 0; i < 20 && !completed; i += 1) {
    const result = tickQuestRun(state, boss, active, { maxHp: 500, attack: 180, defense: 40 });
    completed = Boolean(result.completed);
  }
  assert.equal(active.phaseIndex, 1);
  assert.equal(completed, true);
});
