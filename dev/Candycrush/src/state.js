import { RESOURCE_ORDER } from "./content.js";
import { createInitialUiState, migrateUiProgress } from "./progression.js";
import { createInitialStoryState, migrateStory } from "./story.js";

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
  const state = mergePlain(base, input);
  state.version = SAVE_VERSION;
  for (const key of RESOURCE_ORDER) {
    state.resources[key] = finiteNumber(state.resources[key]);
  }
  state.lastTick = finiteNumber(state.lastTick) || now;
  state.log = Array.isArray(state.log) ? state.log.slice(-80) : base.log;
  state.map.unlocked = unique(["sugarbox", ...(state.map.unlocked || [])]);
  state.inventory.spells = unique(state.inventory.spells || []);
  migrateStory(state);
  return migrateUiProgress(state);
}

function mergePlain(base, extra) {
  if (Array.isArray(base)) return Array.isArray(extra) ? extra.slice() : base.slice();
  if (!base || typeof base !== "object") return extra ?? base;
  const out = { ...base };
  if (!extra || typeof extra !== "object") return out;
  for (const [key, value] of Object.entries(extra)) {
    out[key] = key in base ? mergePlain(base[key], value) : value;
  }
  return out;
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
