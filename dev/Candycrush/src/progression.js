import { MAP_NODES, RESOURCE_ORDER } from "./content.js";
import { getAvailableSecrets } from "./story.js";

const SURFACE_RULES = [
  ["box", () => true],
  ["shop", (state) => state.unlocks.shop],
  ["inventory", (state) => state.unlocks.inventory],
  ["map", (state) => state.unlocks.map],
  ["journal", (state) => state.unlocks.map],
  ["farm", (state) => state.unlocks.farm],
  ["quests", (state) => state.unlocks.quests],
  ["forge", (state) => state.unlocks.forge],
  ["cauldron", (state) => state.unlocks.cauldron],
  ["console", (state) => state.unlocks.developer]
];

const SURFACE_LABELS = {
  box: "box",
  shop: "shop",
  inventory: "inventory",
  map: "map",
  journal: "journal",
  farm: "farm",
  quests: "quests",
  forge: "forge",
  cauldron: "cauldron",
  console: "console"
};

export function createInitialUiState() {
  return {
    stage: "quiet",
    discoveredSurfaces: ["box"],
    seenMilestones: {},
    collapsedLog: true,
    lastReveal: null
  };
}

export function migrateUiProgress(state, options = { infer: true }) {
  state.ui = {
    ...createInitialUiState(),
    ...(state.ui && typeof state.ui === "object" ? state.ui : {})
  };
  state.ui.discoveredSurfaces = unique(["box", ...(state.ui.discoveredSurfaces || [])]);
  state.ui.seenMilestones = state.ui.seenMilestones || {};
  state.ui.stage = getStage(state);
  if (options.infer) {
    for (const [surface, rule] of SURFACE_RULES) {
      if (rule(state)) recordReveal(state, surface, { silent: true });
    }
  }
  return state;
}

export function updateProgression(state) {
  const previousStage = state.ui?.stage || "quiet";
  migrateUiProgress(state, { infer: false });
  state.ui.stage = getStage(state);
  if (previousStage !== state.ui.stage) {
    state.ui.lastReveal = stageMessage(state.ui.stage);
  }
  for (const [surface, rule] of SURFACE_RULES) {
    if (rule(state) && !state.ui.discoveredSurfaces.includes(surface)) {
      recordReveal(state, surface);
    }
  }
  return state;
}

export function getVisibleSurfaces(state) {
  migrateUiProgress(state);
  return SURFACE_RULES
    .map(([surface]) => surface)
    .filter((surface) => state.ui.discoveredSurfaces.includes(surface));
}

export function getVisibleResources(state) {
  const visible = ["candies"];
  const rules = {
    lollipops: state.resources.lollipops > 0 || state.unlocks.farm || state.farm.plots > 0,
    chocolateBars: state.resources.chocolateBars > 0 || state.quests.completed.trainingMeadow,
    sugarGlass: state.resources.sugarGlass > 0 || state.quests.completed.forestAmbush || state.flags.caveSolved,
    moonSalt: state.resources.moonSalt > 0 || state.flags.caveSolved || state.quests.completed.caveMaze,
    prismSeeds: state.resources.prismSeeds > 0 || state.flags.lighthouseSolved || state.quests.completed.seaDive,
    dragonCaramel: state.resources.dragonCaramel > 0 || state.quests.completed.fortressRooms
  };
  for (const key of RESOURCE_ORDER) {
    if (key !== "candies" && rules[key]) visible.push(key);
  }
  return visible;
}

export function getAvailableCommands(state) {
  const commands = [];
  if (!state.flags.boxInspected) {
    return [{ id: "inspect-box", label: "inspect the box", kind: "primary" }];
  }
  const earlyBox = !state.unlocks.map && !state.unlocks.quests;
  if (earlyBox && !state.flags.boxListened && state.resources.candies >= 3) {
    commands.push({ id: "listen-box", label: "listen", kind: "quiet" });
  }
  if (earlyBox && !state.flags.boxShaken && state.resources.candies >= 5) {
    commands.push({ id: "shake-box", label: "shake", kind: "quiet" });
  }
  if (state.resources.candies >= 1) commands.push({ id: "eat", label: "eat", kind: "primary" });
  if (state.resources.candies >= 10) commands.push({ id: "drop", label: "drop 10", kind: "primary" });
  const surfaces = getVisibleSurfaces(state);
  if (surfaces.length > 1) {
    for (const surface of surfaces) {
      commands.push({ id: `tab:${surface}`, label: SURFACE_LABELS[surface], kind: "surface", surface });
    }
  }
  for (const secret of getAvailableSecrets(state)) {
    commands.push({ id: `secret:${secret.id}`, label: secret.label, kind: "quiet" });
  }
  if (canUseSaveMenu(state)) commands.push({ id: "save-menu", label: "save", kind: "system" });
  return commands;
}

export function recordReveal(state, id, options = {}) {
  state.ui = state.ui || createInitialUiState();
  if (id in SURFACE_LABELS && !state.ui.discoveredSurfaces.includes(id)) {
    state.ui.discoveredSurfaces.push(id);
  }
  if (!options.silent && !state.ui.seenMilestones[id]) {
    state.ui.seenMilestones[id] = true;
    state.ui.lastReveal = revealMessage(id);
  }
}

export function getFoggedMapNodes(state) {
  const unlocked = new Set(state.map.unlocked);
  const visibleCount = Math.min(MAP_NODES.length, Math.max(4, state.map.unlocked.length + 2));
  return MAP_NODES.slice(0, visibleCount).map((node) => ({
    ...node,
    fogged: !unlocked.has(node.id)
  }));
}

export function canUseSaveMenu(state) {
  return Boolean(state.purchases.statusRibbon || state.unlocks.inventory || state.stats.candiesEaten >= 20);
}

function getStage(state) {
  if (state.unlocks.endgame) return "afterglow";
  if (state.map.unlocked.includes("hollowOrchard")) return "orchard";
  if (state.unlocks.cauldron || state.quests.completed.desertCaravan) return "alchemy";
  if (state.unlocks.map || state.unlocks.quests) return "world";
  if (state.unlocks.shop || state.flags.boxInspected) return "awake";
  return "quiet";
}

function stageMessage(stage) {
  const messages = {
    quiet: "The box is quiet again.",
    awake: "The box has started answering back.",
    world: "The box is no longer only a box.",
    alchemy: "New systems settle behind the map.",
    orchard: "A final road appears where no road fit before.",
    afterglow: "The game opens a door behind the game."
  };
  return messages[stage] || null;
}

function revealMessage(id) {
  const messages = {
    shop: "A small shop sign folds out from the cardboard.",
    inventory: "The box agrees to keep an inventory.",
    map: "A map edge peeks out from under the candies.",
    journal: "A journal appears, pretending it was always there.",
    farm: "A lollipop row appears beside the box.",
    quests: "The spoon points toward trouble.",
    forge: "Somewhere nearby, an anvil clears its throat.",
    cauldron: "A cauldron begins bubbling in another tab of reality.",
    console: "The orchard leaves behind a developer console."
  };
  return messages[id] || null;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
