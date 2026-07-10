import { LOCATION_DETAILS, RUMORS } from "./content.js";
import { addLog, addResources, hasResources, spendResources } from "./utils.js";

export function createInitialStoryState() {
  return {
    journal: {
      locations: {},
      quests: {},
      recipes: {},
      puzzles: {},
      mysteries: {}
    },
    rumors: [],
    choices: {},
    endings: {},
    npcTrust: {
      shopkeeper: 0,
      forgeApprentice: 0,
      lighthouseKeeper: 0,
      caravanCook: 0,
      orchardVoice: 0
    },
    knownSecrets: {},
    locationDetails: {}
  };
}

export function migrateStory(state) {
  state.story = {
    ...createInitialStoryState(),
    ...(state.story && typeof state.story === "object" ? state.story : {})
  };
  state.story.journal = {
    ...createInitialStoryState().journal,
    ...(state.story.journal || {})
  };
  state.story.npcTrust = {
    ...createInitialStoryState().npcTrust,
    ...(state.story.npcTrust || {})
  };
  state.story.rumors = unique(state.story.rumors || []);
  state.story.choices = state.story.choices || {};
  state.story.endings = state.story.endings || {};
  state.story.knownSecrets = state.story.knownSecrets || {};
  state.story.locationDetails = state.story.locationDetails || {};
  inferStoryFromProgress(state);
  return state;
}

export function recordLocationVisit(state, id) {
  migrateStory(state);
  if (!state.story.journal.locations[id]) {
    state.story.journal.locations[id] = { visited: true, notes: [] };
  }
}

export function inspectLocation(state, id) {
  migrateStory(state);
  const details = LOCATION_DETAILS[id] || [];
  const seen = state.story.locationDetails[id] || 0;
  if (!details[seen]) {
    addLog(state, "You inspect the place again. It politely refuses to become new.");
    return false;
  }
  state.story.locationDetails[id] = seen + 1;
  recordLocationVisit(state, id);
  state.story.journal.locations[id].notes = unique([
    ...(state.story.journal.locations[id].notes || []),
    details[seen]
  ]);
  addLog(state, details[seen]);
  return true;
}

export function buyRumor(state) {
  migrateStory(state);
  const rumor = RUMORS.find((entry) => !state.story.rumors.includes(entry.id) && rumorVisible(state, entry));
  if (!rumor) {
    addLog(state, "No one has a new rumor worth selling.");
    return false;
  }
  if (!hasResources(state, rumor.cost)) {
    addLog(state, "The rumor-seller waits for a more funded curiosity.");
    return false;
  }
  spendResources(state, rumor.cost);
  state.story.rumors.push(rumor.id);
  addLog(state, `Rumor: ${rumor.text}`);
  return true;
}

export function recordQuestCompletion(state, quest) {
  migrateStory(state);
  state.story.journal.quests[quest.id] = {
    name: quest.name,
    type: quest.type || "combat",
    completed: state.quests.completed[quest.id] || 0
  };
  if (quest.location) recordLocationVisit(state, quest.location);
}

export function recordRecipeKnown(state, id, name) {
  migrateStory(state);
  state.story.journal.recipes[id] = name;
}

export function recordPuzzleSolved(state, id, note) {
  migrateStory(state);
  state.story.journal.puzzles[id] = note || "solved";
}

export function recordChoice(state, questId, eventId, choice) {
  migrateStory(state);
  state.story.choices[`${questId}:${eventId}`] = choice.id;
  if (choice.trust) {
    for (const [npc, amount] of Object.entries(choice.trust)) {
      state.story.npcTrust[npc] = (state.story.npcTrust[npc] || 0) + amount;
    }
  }
}

export function recordEnding(state, id, label) {
  migrateStory(state);
  if (!state.story.endings[id]) {
    state.story.endings[id] = {
      label,
      achievedAt: Date.now()
    };
    addLog(state, `Ending discovered: ${label}.`);
  }
}

export function triggerSecret(state, id) {
  migrateStory(state);
  if (state.story.knownSecrets[id]) {
    addLog(state, "The secret has already been squeezed dry.");
    return false;
  }
  if (id === "groundMouth") {
    state.story.knownSecrets[id] = true;
    addResources(state, { moonSalt: 1, lollipops: 80 });
    addLog(state, "The candy pile whispers a moon-salt syllable.");
    return true;
  }
  if (id === "sweetTooth") {
    state.story.knownSecrets[id] = true;
    state.stats.bonusMaxHp += 10;
    addLog(state, "You count your sweet teeth. One of them counts back.");
    return true;
  }
  return false;
}

export function getJournalSummary(state) {
  migrateStory(state);
  return {
    locations: Object.entries(state.story.journal.locations),
    quests: Object.values(state.story.journal.quests),
    recipes: Object.values(state.story.journal.recipes),
    puzzles: Object.entries(state.story.journal.puzzles),
    rumors: state.story.rumors.map((id) => RUMORS.find((rumor) => rumor.id === id)?.text).filter(Boolean),
    endings: Object.values(state.story.endings),
    mysteries: Object.entries(state.story.journal.mysteries)
      .filter(([id]) => !state.story.rumors.includes(id))
      .map(([, text]) => text),
    trust: state.story.npcTrust
  };
}

export function getAvailableSecrets(state) {
  migrateStory(state);
  const commands = [];
  if (state.stats.candiesDropped >= 100 && !state.story.knownSecrets.groundMouth) {
    commands.push({ id: "groundMouth", label: "whisper to the pile" });
  }
  if (state.stats.candiesEaten >= 150 && !state.story.knownSecrets.sweetTooth) {
    commands.push({ id: "sweetTooth", label: "count sweet teeth" });
  }
  return commands;
}

function inferStoryFromProgress(state) {
  for (const id of state.map.unlocked || []) {
    if (!state.story.journal.locations[id]) {
      state.story.journal.locations[id] = { visited: true, notes: [] };
    }
  }
  for (const [questId, count] of Object.entries(state.quests?.completed || {})) {
    if (count) state.story.journal.quests[questId] = state.story.journal.quests[questId] || { name: questId, completed: count };
  }
  if (state.flags.caveSolved) state.story.journal.puzzles.saltCave = "The salt cave path is known.";
  if (state.flags.lighthouseSolved) state.story.journal.puzzles.lighthouse = "The lighthouse beam points to the pier.";
  if (state.quests?.completed?.finalOrchard && !state.story.endings.orchard) {
    state.story.endings.orchard = { label: "The Hollow Orchard", achievedAt: Date.now() };
  }
}

function rumorVisible(state, rumor) {
  if (!rumor.when) return true;
  if (rumor.when.map && !state.map.unlocked.includes(rumor.when.map)) return false;
  if (rumor.when.completedQuest && !state.quests.completed[rumor.when.completedQuest]) return false;
  if (rumor.when.flag && !state.flags[rumor.when.flag]) return false;
  return true;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
