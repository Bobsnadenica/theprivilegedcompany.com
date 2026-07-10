import { EQUIPMENT, LIGHTHOUSE_SEQUENCE, RIDDLES, SHOP_ITEMS, WISHES, CAVE_SEQUENCE, DEV_COMMANDS } from "./content.js";
import { estimateFarmCapacity, estimateLollipopRate, summarizeOfflineGain } from "./balance.js";
import { recordEnding, recordPuzzleSolved } from "./story.js";
import {
  addLog,
  addMapNodes,
  addResources,
  addUnlocks,
  getPurchaseCount,
  hasResources,
  ownsItem,
  spendResources
} from "./utils.js";
import { updateProgression } from "./progression.js";

const OFFLINE_CAP_SECONDS = 6 * 60 * 60;

export function deriveStats(state) {
  const gear = Object.values(state.equipment)
    .filter(Boolean)
    .map((id) => EQUIPMENT[id])
    .filter(Boolean);
  const eatenHp = Math.min(160, Math.floor(state.stats.candiesEaten / 20));
  const base = {
    maxHp: 100 + eatenHp + (state.stats.bonusMaxHp || 0),
    attack: 4,
    defense: 0,
    candyRate: 1
  };
  for (const item of gear) {
    base.attack += item.attack || 0;
    base.defense += item.defense || 0;
    base.maxHp += item.maxHp || 0;
    base.candyRate += item.candyRate || 0;
  }
  base.candyRate += state.farm.upgrades * 0.8;
  if (state.flags.farmOverclocked) base.candyRate += 4;
  return base;
}

export function tickState(state, now = Date.now()) {
  const elapsed = Math.max(0, Math.floor((now - state.lastTick) / 1000));
  if (elapsed <= 0) return { elapsed: 0, capped: false };
  const cappedElapsed = Math.min(elapsed, OFFLINE_CAP_SECONDS);
  const stats = deriveStats(state);
  const gain = { candies: cappedElapsed * stats.candyRate, lollipops: 0, chocolateBars: 0 };
  state.resources.candies += gain.candies;
  const farmRate = getLollipopRate(state);
  gain.lollipops = cappedElapsed * farmRate;
  state.resources.lollipops += gain.lollipops;
  const chocolateRate = getChocolateRate(state);
  state.timers.chocolate += cappedElapsed * chocolateRate;
  while (state.timers.chocolate >= 1) {
    state.resources.chocolateBars += 1;
    gain.chocolateBars += 1;
    state.timers.chocolate -= 1;
  }
  state.lastTick = now;
  state.stats.offlineSeconds += Math.max(0, elapsed - cappedElapsed);
  if (elapsed >= 60) addLog(state, summarizeOfflineGain(gain));
  refreshUnlocks(state);
  return { elapsed: cappedElapsed, capped: elapsed !== cappedElapsed };
}

export function getLollipopRate(state) {
  if (!state.farm.planted) return 0;
  return estimateLollipopRate(state.farm.planted, state.farm.upgrades, state.flags.farmOverclocked);
}

export function getChocolateRate(state) {
  let rate = 0;
  if (state.quests.completed.trainingMeadow) rate += 1 / 420;
  if (state.equipment.trinket === "prismCharm") rate += 1 / 240;
  return rate;
}

export function refreshUnlocks(state) {
  if (state.resources.candies >= 10 || state.stats.candiesEaten > 0 || state.stats.candiesDropped > 0) {
    state.unlocks.shop = true;
  }
  if (state.stats.candiesEaten >= 20 || state.purchases.statusRibbon) {
    state.unlocks.inventory = true;
  }
  if (state.purchases.tinSpoon || ownsItem(state, "tinSpoon")) {
    state.unlocks.quests = true;
  }
  if (state.farm.plots > 0) {
    state.unlocks.farm = true;
    addMapNodes(state, ["orchardFarm"]);
  }
  if (state.unlocks.map) {
    addMapNodes(state, ["village", "brokenBridge"]);
  }
  if (state.flags.bridgeRepaired) addMapNodes(state, ["whisperingForest"]);
  if (state.quests.completed.forestAmbush) addMapNodes(state, ["saltCave"]);
  if (state.flags.caveSolved) addMapNodes(state, ["lighthouse"]);
  if (state.flags.lighthouseSolved) addMapNodes(state, ["pier", "taffySea"]);
  if (state.quests.completed.seaDive) addMapNodes(state, ["amberDesert"]);
  if (state.quests.completed.desertCaravan) addMapNodes(state, ["glassFortress", "moonWell"]);
  if (state.quests.completed.fortressRooms) addMapNodes(state, ["licoriceKeep"]);
  if (state.quests.completed.licoriceKeep) addMapNodes(state, ["hollowOrchard"]);
  updateProgression(state);
}

export function inspectBox(state) {
  if (state.flags.boxInspected) {
    addLog(state, "The box remains a box, but now it knows you know.");
    return false;
  }
  state.flags.boxInspected = true;
  addLog(state, "You inspect the box. One corner is folded like a tiny door.");
  refreshUnlocks(state);
  return true;
}

export function listenBox(state) {
  if (state.flags.boxListened) return false;
  state.flags.boxListened = true;
  addLog(state, "You listen. Something inside counts candies before you do.");
  refreshUnlocks(state);
  return true;
}

export function shakeBox(state) {
  if (state.flags.boxShaken) return false;
  state.flags.boxShaken = true;
  addResources(state, { candies: 3 });
  addLog(state, "You shake the box. Three embarrassed candies fall out.");
  refreshUnlocks(state);
  return true;
}

export function eatCandies(state) {
  const amount = Math.floor(state.resources.candies);
  if (amount <= 0) {
    addLog(state, "You try to eat a candy before it arrives.");
    return false;
  }
  state.resources.candies = 0;
  state.stats.candiesEaten += amount;
  addLog(state, `You eat ${amount} candies. Your resolve feels stickier.`);
  refreshUnlocks(state);
  return true;
}

export function dropCandies(state) {
  if (!spendResources(state, { candies: 10 })) {
    addLog(state, "You need 10 candies to make a meaningful little pile.");
    return false;
  }
  state.stats.candiesDropped += 10;
  if (state.stats.candiesDropped === 10) {
    addLog(state, "The candies on the ground arrange themselves into an arrow.");
  } else if (state.stats.candiesDropped >= 50 && !state.flags.groundArrowSeen) {
    state.flags.groundArrowSeen = true;
    addResources(state, { lollipops: 5 });
    addLog(state, "Something below the pile trades five lollipops for privacy.");
  } else {
    addLog(state, "Ten candies hit the ground. The ground looks smug.");
  }
  refreshUnlocks(state);
  return true;
}

export function buyShopItem(state, id) {
  const item = SHOP_ITEMS.find((entry) => entry.id === id);
  if (!item) return false;
  const count = getPurchaseCount(state, id);
  if (item.max && count >= item.max) {
    addLog(state, "The shopkeeper points at the empty shelf.");
    return false;
  }
  if (!hasResources(state, item.cost)) {
    addLog(state, "The shopkeeper waits for a richer version of you.");
    return false;
  }
  spendResources(state, item.cost);
  state.purchases[id] = count + 1;
  applyEffect(state, item.effect);
  refreshUnlocks(state);
  return true;
}

export function equipItem(state, id) {
  const item = EQUIPMENT[id];
  if (!item || !ownsItem(state, id)) return false;
  state.equipment[item.slot] = id;
  addLog(state, `${item.name} equipped.`);
  return true;
}

export function plantLollipops(state, amount = 10) {
  const capacity = estimateFarmCapacity(state.farm.plots, state.farm.upgrades);
  const actual = Math.min(amount, capacity - state.farm.planted);
  if (actual <= 0) {
    addLog(state, "The farm is full of patient lollipops.");
    return false;
  }
  if (!spendResources(state, { lollipops: actual })) {
    addLog(state, "You need more lollipops to plant that many.");
    return false;
  }
  state.farm.planted += actual;
  addLog(state, `${actual} lollipops planted.`);
  return true;
}

export function buyFarmPlot(state) {
  const next = state.farm.plots + 1;
  const cost = { candies: 250 * next, lollipops: 80 * next };
  if (!spendResources(state, cost)) {
    addLog(state, "The next plot wants more candy and more paperwork.");
    return false;
  }
  state.farm.plots += 1;
  addLog(state, "A new row opens at the orchard farm.");
  refreshUnlocks(state);
  return true;
}

export function upgradeFarm(state) {
  const next = state.farm.upgrades + 1;
  const cost = { lollipops: 500 * next, sugarGlass: next };
  if (!spendResources(state, cost)) {
    addLog(state, "The farm refuses to improve without shiny encouragement.");
    return false;
  }
  state.farm.upgrades += 1;
  addLog(state, "The farm learns a faster kind of waiting.");
  return true;
}

export function repairBridge(state) {
  if (state.flags.bridgeRepaired) return false;
  if (!spendResources(state, { candies: 500, lollipops: 120 })) {
    addLog(state, "The bridge still needs 500 candies and 120 lollipops.");
    return false;
  }
  state.flags.bridgeRepaired = true;
  addLog(state, "The bridge accepts your repairs and pretends it was always sturdy.");
  refreshUnlocks(state);
  return true;
}

export function answerRiddle(state, text) {
  const step = state.puzzles.riddleStep;
  const riddle = RIDDLES[step];
  if (!riddle) {
    addLog(state, "The trees have run out of questions and look relieved.");
    return false;
  }
  const normalized = String(text || "").trim().toLowerCase();
  if (normalized !== riddle.answer) {
    addLog(state, "Leaves rustle in the shape of no.");
    return false;
  }
  addResources(state, riddle.reward);
  if (riddle.flag) state.flags[riddle.flag] = true;
  state.puzzles.riddleStep += 1;
  recordPuzzleSolved(state, `riddle-${state.puzzles.riddleStep}`, riddle.prompt);
  addLog(state, "The tree accepts your answer and drops something useful.");
  return true;
}

export function stepCave(state, direction) {
  const expected = CAVE_SEQUENCE[state.puzzles.caveProgress.length];
  if (direction !== expected) {
    state.puzzles.caveProgress = [];
    addLog(state, "The cave rearranges itself around that mistake.");
    return false;
  }
  state.puzzles.caveProgress.push(direction);
  if (state.puzzles.caveProgress.length === CAVE_SEQUENCE.length) {
    state.flags.caveSolved = true;
    addResources(state, { sugarGlass: 2, moonSalt: 1 });
    recordPuzzleSolved(state, "saltCave", "The salt cave path is known.");
    addLog(state, "The salt cave opens a clean path to its deepest room.");
    refreshUnlocks(state);
  } else {
    addLog(state, `The cave hums after you walk ${direction}.`);
  }
  return true;
}

export function pushLighthouseColor(state, color) {
  const expected = LIGHTHOUSE_SEQUENCE[state.puzzles.lighthouseProgress.length];
  if (color !== expected) {
    state.puzzles.lighthouseProgress = [];
    addLog(state, "The beam scatters across the sea and starts over.");
    return false;
  }
  state.puzzles.lighthouseProgress.push(color);
  if (state.puzzles.lighthouseProgress.length === LIGHTHOUSE_SEQUENCE.length) {
    state.flags.lighthouseSolved = true;
    addResources(state, { prismSeeds: 2 });
    recordPuzzleSolved(state, "lighthouse", "The lighthouse beam points to the pier.");
    addLog(state, "The lighthouse beam draws a pier on the edge of the map.");
    refreshUnlocks(state);
  } else {
    addLog(state, `The ${color} lens clicks into place.`);
  }
  return true;
}

export function makeWish(state, id) {
  const wish = WISHES.find((entry) => entry.id === id);
  if (!wish) return false;
  const count = state.puzzles.wishes[id] || 0;
  if (wish.max && count >= wish.max) {
    addLog(state, "The well has already granted that wish.");
    return false;
  }
  if (!spendResources(state, wish.cost)) {
    addLog(state, "The well waits. It is patient and expensive.");
    return false;
  }
  state.puzzles.wishes[id] = count + 1;
  state.stats.wishes += 1;
  applyEffect(state, wish.effect);
  refreshUnlocks(state);
  return true;
}

export function runDevCommand(state, id) {
  const command = DEV_COMMANDS.find((entry) => entry.id === id);
  if (!command || !state.unlocks.developer) return false;
  if (command.once && state.puzzles.devCommands[id]) {
    addLog(state, "The console refuses to run that bug twice.");
    return false;
  }
  if (!spendResources(state, command.cost)) {
    addLog(state, "The console prints: insufficient nonsense.");
    return false;
  }
  state.puzzles.devCommands[id] = (state.puzzles.devCommands[id] || 0) + 1;
  applyEffect(state, command.effect);
  return true;
}

export function applyEffect(state, effect = {}) {
  addUnlocks(state, effect.unlocks);
  addMapNodes(state, effect.map);
  addResources(state, effect.resources);
  if (effect.farmPlots) state.farm.plots += effect.farmPlots;
  if (effect.maxHp) state.stats.bonusMaxHp += effect.maxHp;
  if (effect.equipment) {
    state.inventory.items[effect.equipment] = 1;
    equipItem(state, effect.equipment);
  }
  if (effect.spells) {
    state.inventory.spells = [...new Set([...state.inventory.spells, ...effect.spells])];
  }
  if (effect.flag) state.flags[effect.flag] = true;
  if (effect.ending) recordEnding(state, effect.ending, effect.endingLabel || effect.ending);
  if (effect.toggleDark) state.darkMode = !state.darkMode;
  addLog(state, effect.log);
}

export { OFFLINE_CAP_SECONDS };
