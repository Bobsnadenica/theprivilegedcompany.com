import { QUESTS, RESOURCE_ORDER } from "./content.js?v=20260927b";
import { createQuestRun } from "./questTypes.js?v=20260927b";
import { createInitialUiState, migrateUiProgress } from "./progression.js?v=20260927b";
import { createInitialStoryState, migrateStory } from "./story.js?v=20260927b";

export const SAVE_VERSION = 3;

export function createInitialState(now = Date.now()) {
  const resources = Object.fromEntries(RESOURCE_ORDER.map((key) => [key, 0]));
  return {
    version: SAVE_VERSION,
    createdAt: now,
    lastTick: now,
    activeTab: "box",
    darkMode: false,
    ui: createInitialUiState(),
    story: createInitialStoryState(),
    resources,
    stats: {
      candiesEaten: 0,
      candiesDropped: 0,
      questsCompleted: 0,
      deaths: 0,
      wishes: 0,
      offlineSeconds: 0,
      bonusMaxHp: 0
    },
    unlocks: {
      inventory: false,
      shop: false,
      map: false,
      farm: false,
      quests: false,
      forge: false,
      cauldron: false,
      developer: false,
      endgame: false,
      quickTravel: false
    },
    flags: {},
    purchases: {},
    inventory: {
      items: {
        bareHands: 1
      },
      potions: {
        health: 0,
        turtle: 0,
        quicksilver: 0,
        starfire: 0,
        focus: 0,
        glass: 0,
        moon: 0,
        prism: 0,
        caramel: 0,
        echo: 0
      },
      spells: []
    },
    equipment: {
      weapon: "bareHands",
      armor: null,
      trinket: null
    },
    farm: {
      plots: 0,
      planted: 0,
      upgrades: 0
    },
    map: {
      current: "sugarbox",
      unlocked: ["sugarbox"],
      visited: { sugarbox: true }
    },
    quests: {
      completed: {}
    },
    puzzles: {
      riddleStep: 0,
      caveProgress: [],
      lighthouseProgress: [],
      wishes: {},
      devCommands: {}
    },
    activeQuest: null,
    timers: {
      chocolate: 0
    },
    log: [
      "The box is quiet.",
      "A candy lands inside."
    ]
  };
}

export function normalizeState(input, now = Date.now()) {
  const base = createInitialState(now);
  if (!input || typeof input !== "object") return base;
  validateShape(input, base);
  const state = mergePlain(base, input);
  state.version = SAVE_VERSION;
  for (const key of RESOURCE_ORDER) {
    state.resources[key] = finiteNumber(state.resources[key]);
  }
  state.lastTick = finiteNumber(state.lastTick) || now;
  state.log = Array.isArray(state.log) ? state.log.slice(-80) : base.log;
  state.map.unlocked = unique(["sugarbox", ...(state.map.unlocked || [])]);
  state.inventory.spells = unique(state.inventory.spells || []);
  for (const value of [state.ui.lastReveal, ...Object.values(state.equipment)]) {
    if (value !== null && typeof value !== "string") throw new Error("Invalid saved text");
  }
  for (const values of [state.map.unlocked, state.inventory.spells, state.log,
    state.ui.discoveredSurfaces, state.story.rumors, state.puzzles.caveProgress, state.puzzles.lighthouseProgress]) {
    if (values.some((value) => typeof value !== "string")) throw new Error("Invalid save list");
  }
  for (const entry of Object.values(state.story.journal.locations)) {
    validateShape(entry, { visited: true, notes: [] });
    if (!Array.isArray(entry.notes) || entry.notes.some((note) => typeof note !== "string")) throw new Error("Invalid journal notes");
  }
  for (const entry of Object.values(state.story.journal.quests)) validateShape(entry, { name: "", type: "", completed: 0 });
  for (const entry of Object.values(state.story.endings)) validateShape(entry, { label: "", achievedAt: 0 });
  for (const record of [state.story.journal.recipes, state.story.journal.puzzles, state.story.journal.mysteries, state.story.choices]) {
    if (Object.values(record).some((value) => typeof value !== "string")) throw new Error("Invalid journal text");
  }
  for (const record of [state.inventory.items, state.inventory.potions, state.purchases, state.quests.completed,
    state.puzzles.wishes, state.puzzles.devCommands, state.story.locationDetails]) {
    for (const value of Object.values(record)) {
      if (typeof value !== "number" && typeof value !== "boolean") throw new Error("Invalid save counter");
    }
  }
  if (state.activeQuest) {
    const quest = QUESTS.find((entry) => entry.id === state.activeQuest.id);
    if (!quest) throw new Error("Invalid saved quest");
    const defaults = createQuestRun(quest, { maxHp: 100 });
    validateShape(state.activeQuest, defaults);
    state.activeQuest = mergePlain(defaults, state.activeQuest);
    if (state.activeQuest.log.some((line) => typeof line !== "string")) throw new Error("Invalid quest log");
    for (const enemy of state.activeQuest.enemies) {
      validateShape(enemy, { name: "", hp: 0, hpLeft: 0, attack: 0, armor: 0 });
    }
    if (state.activeQuest.pendingChoice) {
      const choice = quest.events?.find((entry) => entry.id === state.activeQuest.pendingChoice.id);
      if (!choice) throw new Error("Invalid saved choice");
      state.activeQuest.pendingChoice = choice;
    }
  }
  migrateStory(state);
  return migrateUiProgress(state);
}

function mergePlain(base, extra) {
  if (Array.isArray(base)) return Array.isArray(extra) ? extra.slice() : base.slice();
  if (!base || typeof base !== "object") return extra ?? base;
  const out = { ...base };
  if (!extra || typeof extra !== "object") return out;
  for (const [key, value] of Object.entries(extra)) {
    if (["__proto__", "constructor", "prototype"].includes(key)) continue;
    out[key] = Object.hasOwn(base, key) ? mergePlain(base[key], value) : value;
  }
  return out;
}

function validateShape(value, template) {
  if (template === null || value === undefined) return;
  if (Array.isArray(template)) {
    if (!Array.isArray(value)) throw new Error("Invalid save list");
  } else if (typeof template === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid save object");
    for (const [key, expected] of Object.entries(template)) validateShape(value[key], expected);
  } else if (typeof value !== typeof template || (typeof value === "number" && !Number.isFinite(value))) {
    throw new Error("Invalid save value");
  }
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
