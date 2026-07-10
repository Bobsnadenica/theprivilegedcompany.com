import { QUESTS } from "./content.js";
import { addLog, addMapNodes, addResources, requirementMet, spendResources } from "./utils.js";
import { deriveStats, refreshUnlocks } from "./economy.js";
import { applyPotionToRun, applyQuestChoice, createQuestRun, tickQuestRun } from "./questTypes.js";
import { recordChoice, recordEnding, recordQuestCompletion } from "./story.js";

export function getQuest(id) {
  return QUESTS.find((quest) => quest.id === id);
}

export function availableQuests(state) {
  return QUESTS.filter((quest) => requirementMet(state, quest.unlock));
}

export function startQuest(state, id) {
  if (state.activeQuest) {
    addLog(state, "You are already in a quest.");
    return false;
  }
  const quest = getQuest(id);
  if (!quest || !requirementMet(state, quest.unlock)) {
    addLog(state, "That quest is still out of reach.");
    return false;
  }
  state.activeQuest = createQuestRun(quest, deriveStats(state));
  addLog(state, `Quest started: ${quest.name}.`);
  return true;
}

export function abandonQuest(state) {
  if (!state.activeQuest) return false;
  const quest = getQuest(state.activeQuest.id);
  state.activeQuest = null;
  addLog(state, `${quest?.name || "The quest"} is abandoned for now.`);
  return true;
}

export function tickQuest(state) {
  const active = state.activeQuest;
  if (!active) return false;
  const quest = getQuest(active.id);
  if (!quest) {
    state.activeQuest = null;
    return false;
  }
  const result = tickQuestRun(state, quest, active, deriveStats(state));
  for (const line of result.logs || []) pushQuestLog(active, line);
  if (result.completed) return completeQuest(state, quest);
  if (result.failed) return failQuest(state, quest);
  return true;
}

export function chooseQuestChoice(state, choiceId) {
  const active = state.activeQuest;
  if (!active?.pendingChoice) return false;
  const choice = active.pendingChoice.choices.find((entry) => entry.id === choiceId);
  if (!choice) return false;
  const quest = getQuest(active.id);
  const line = applyQuestChoice(active, choice);
  recordChoice(state, active.id, active.choicesMade ? Object.keys(active.choicesMade).at(-1) || "choice" : "choice", choice);
  pushQuestLog(active, line);
  addLog(state, `${quest?.name || "Quest"} choice: ${choice.label}.`);
  return true;
}

export function usePotion(state, id) {
  const active = state.activeQuest;
  if (!active || !state.inventory.potions[id]) return false;
  const line = applyPotionToRun(active, id);
  if (!line) return false;
  state.inventory.potions[id] -= 1;
  pushQuestLog(active, line);
  const enemy = active.enemies?.[active.enemyIndex];
  if (enemy && enemy.hpLeft <= 0) pushQuestLog(active, `${enemy.name} is scorched away.`);
  return true;
}

export function castSpell(state, id) {
  const active = state.activeQuest;
  if (!active || !state.inventory.spells.includes(id)) return false;
  if (id === "fizzbolt") {
    if (!spendResources(state, { lollipops: 40 })) return false;
    const enemy = active.enemies?.[active.enemyIndex];
    if (enemy) {
      enemy.hpLeft -= 36 + (active.buffs.focus ? 10 : 0);
      pushQuestLog(active, "Fizzbolt pops against the enemy.");
    } else {
      active.progress += 12;
      pushQuestLog(active, "Fizzbolt lights the way forward.");
    }
  } else if (id === "sugarShield") {
    if (!spendResources(state, { candies: 90 })) return false;
    active.buffs.shield = Math.max(active.buffs.shield, 4);
    pushQuestLog(active, "A sugar shield hardens around you.");
  } else if (id === "blink") {
    if (!spendResources(state, { lollipops: 120 })) return false;
    active.playerHp = Math.min(active.maxHp, active.playerHp + 25);
    active.buffs.quicksilver = Math.max(active.buffs.quicksilver, 2);
    active.progress += 8;
    pushQuestLog(active, "You blink to a luckier position.");
  }
  return true;
}

export function runQuestToEnd(state, id, options = {}) {
  if (!startQuest(state, id)) return false;
  let guard = 0;
  while (state.activeQuest && guard < 500) {
    if (state.activeQuest.pendingChoice) {
      const choice = state.activeQuest.pendingChoice.choices[options.choiceIndex || 0];
      chooseQuestChoice(state, choice.id);
    }
    if (options.autoPotions) {
      const active = state.activeQuest;
      if (active.playerHp < active.maxHp * 0.35 && state.inventory.potions.health) usePotion(state, "health");
      if (active.round === 1 && state.inventory.potions.turtle) usePotion(state, "turtle");
      if (active.round === 2 && state.inventory.potions.quicksilver) usePotion(state, "quicksilver");
      if (active.type !== "combat" && active.type !== "boss" && state.inventory.potions.prism) usePotion(state, "prism");
    }
    tickQuest(state);
    guard += 1;
  }
  return !state.activeQuest;
}

function completeQuest(state, quest) {
  const firstTime = !state.quests.completed[quest.id];
  const rewards = firstTime ? quest.rewards : quest.repeatRewards || quest.rewards;
  const charmBonus = state.equipment.trinket === "prismCharm" ? 1.15 : 1;
  addResources(state, rewards, charmBonus);
  state.quests.completed[quest.id] = (state.quests.completed[quest.id] || 0) + 1;
  state.stats.questsCompleted += 1;
  if (firstTime && quest.first) {
    if (quest.first.unlocks) {
      for (const key of quest.first.unlocks) {
        if (key in state.unlocks) state.unlocks[key] = true;
      }
    }
    addMapNodes(state, quest.first.map);
    if (quest.first.ending) recordEnding(state, quest.first.ending, quest.first.endingLabel || quest.name);
    addLog(state, quest.first.log);
  }
  recordQuestCompletion(state, quest);
  addLog(state, `Quest complete: ${quest.name}.`);
  state.activeQuest = null;
  refreshUnlocks(state);
  return true;
}

function failQuest(state, quest) {
  state.stats.deaths += 1;
  const lost = Math.min(Math.floor(state.resources.candies), 100 + state.stats.deaths * 20);
  state.resources.candies -= lost;
  addLog(state, `${quest.name} defeats you. ${lost} candies melt on the way home.`);
  state.activeQuest = null;
  return true;
}

function pushQuestLog(active, line) {
  if (!line) return;
  active.log.push(line);
  active.log = active.log.slice(-20);
}
