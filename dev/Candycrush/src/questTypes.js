export function createQuestRun(quest, stats) {
  const active = {
    id: quest.id,
    type: quest.type || "combat",
    round: 0,
    playerHp: stats.maxHp,
    maxHp: stats.maxHp,
    phaseIndex: 0,
    enemyIndex: 0,
    progress: 0,
    integrity: quest.integrity || 100,
    targetProgress: quest.targetProgress || 100,
    roundsRequired: quest.roundsRequired || 10,
    choicesMade: {},
    pendingChoice: null,
    enemies: buildPhaseEnemies(quest, 0),
    buffs: {
      turtle: 0,
      quicksilver: 0,
      shield: 0,
      focus: 0,
      glass: 0,
      moon: 0,
      prism: 0
    },
    log: [`You begin: ${quest.name}.`]
  };
  return active;
}

export function tickQuestRun(state, quest, active, stats) {
  const logs = [];
  if (active.pendingChoice) return { logs };
  const event = nextEvent(quest, active);
  if (event) {
    active.pendingChoice = event;
    logs.push(event.text);
    return { logs };
  }

  active.round += 1;
  if (active.type === "exploration") return tickExploration(quest, active, stats, logs);
  if (active.type === "survival") return tickSurvival(quest, active, stats, logs);
  if (active.type === "puzzle") return tickPuzzle(quest, active, stats, logs);
  if (active.type === "escort") return tickEscort(quest, active, stats, logs);
  return tickCombat(quest, active, stats, logs);
}

export function applyQuestChoice(active, choice) {
  active.choicesMade[active.pendingChoice.id] = choice.id;
  if (choice.effect?.heal) active.playerHp = Math.min(active.maxHp, active.playerHp + choice.effect.heal);
  if (choice.effect?.progress) active.progress += choice.effect.progress;
  if (choice.effect?.integrity) active.integrity = Math.min(100, active.integrity + choice.effect.integrity);
  if (choice.effect?.buff) {
    active.buffs[choice.effect.buff] = Math.max(active.buffs[choice.effect.buff] || 0, choice.effect.duration || 5);
  }
  active.pendingChoice = null;
  return choice.log || "You choose a path and the quest bends around it.";
}

export function applyPotionToRun(active, id) {
  if (id === "health") {
    active.playerHp = Math.min(active.maxHp, active.playerHp + 80);
    return "You drink a health potion.";
  }
  if (id === "turtle") {
    active.buffs.turtle = Math.max(active.buffs.turtle, 8);
    return "A shell of patience surrounds you.";
  }
  if (id === "quicksilver") {
    active.buffs.quicksilver = Math.max(active.buffs.quicksilver, 6);
    return "Your spoon hand blurs.";
  }
  if (id === "starfire") {
    const enemy = active.enemies[active.enemyIndex];
    if (enemy) enemy.hpLeft -= 90;
    return "Starfire burns through the room.";
  }
  if (id === "focus") {
    active.buffs.focus = Math.max(active.buffs.focus, 7);
    return "The quest's edges sharpen.";
  }
  if (id === "glass") {
    active.buffs.glass = Math.max(active.buffs.glass, 6);
    return "Glass luck reflects the next few blows.";
  }
  if (id === "moon") {
    active.buffs.moon = Math.max(active.buffs.moon, 6);
    active.playerHp = Math.min(active.maxHp, active.playerHp + 40);
    return "Moon syrup makes your shadow useful.";
  }
  if (id === "prism") {
    active.buffs.prism = Math.max(active.buffs.prism, 6);
    active.progress += 12;
    return "Prism vapor reveals the shortest route.";
  }
  if (id === "caramel") {
    active.integrity = Math.min(100, active.integrity + 25);
    active.buffs.shield = Math.max(active.buffs.shield, 5);
    return "Caramel varnish seals the cracks.";
  }
  if (id === "echo") {
    active.buffs.quicksilver = Math.max(active.buffs.quicksilver, 3);
    active.buffs.focus = Math.max(active.buffs.focus, 3);
    return "An echo repeats your best idea.";
  }
  return null;
}

function tickCombat(quest, active, stats, logs) {
  const enemy = active.enemies[active.enemyIndex];
  if (!enemy) return advancePhaseOrComplete(quest, active, logs);
  let playerDamage = Math.max(1, stats.attack + (active.round % 4) - enemy.armor);
  if (active.buffs.quicksilver > 0) playerDamage *= 2;
  if (active.buffs.focus > 0) playerDamage += 8;
  if (active.buffs.prism > 0 && active.round % 2 === 0) playerDamage += 10;
  enemy.hpLeft -= playerDamage;
  logs.push(`Round ${active.round}: you hit ${enemy.name} for ${playerDamage}.`);
  if (enemy.hpLeft <= 0) {
    logs.push(`${enemy.name} falls.`);
    active.enemyIndex += 1;
    if (active.enemyIndex >= active.enemies.length) return advancePhaseOrComplete(quest, active, logs);
    logs.push(`${active.enemies[active.enemyIndex].name} steps forward.`);
    tickBuffs(active);
    return { logs };
  }

  let enemyDamage = Math.max(0, enemy.attack - stats.defense - active.buffs.shield);
  if (enemy.ability === "pierce") enemyDamage += 3;
  if (enemy.ability === "drain" && active.round % 3 === 0) {
    enemy.hpLeft = Math.min(enemy.hp, enemy.hpLeft + 8);
    logs.push(`${enemy.name} drinks back a little damage.`);
  }
  if (active.buffs.turtle > 0) enemyDamage = Math.floor(enemyDamage / 2);
  if (active.buffs.glass > 0 && active.round % 2 === 1) enemyDamage = Math.floor(enemyDamage / 2);
  enemyDamage += hazardDamage(quest, active);
  active.playerHp -= enemyDamage;
  logs.push(`${enemy.name} deals ${enemyDamage}.`);
  tickBuffs(active);
  return { logs, failed: active.playerHp <= 0 };
}

function tickExploration(quest, active, stats, logs) {
  const gain = 9 + Math.floor(stats.attack / 4) + (active.buffs.prism > 0 ? 8 : 0);
  active.progress += gain;
  active.playerHp -= hazardDamage(quest, active);
  logs.push(`You map ${gain} steps of the place.`);
  tickBuffs(active);
  return { logs, completed: active.progress >= active.targetProgress, failed: active.playerHp <= 0 };
}

function tickSurvival(quest, active, stats, logs) {
  const damage = Math.max(1, (quest.hazards?.damage || 8) - Math.floor(stats.defense / 2) - active.buffs.shield);
  active.playerHp -= active.buffs.turtle > 0 ? Math.floor(damage / 2) : damage;
  logs.push(`You endure round ${active.round}/${active.roundsRequired}.`);
  tickBuffs(active);
  return { logs, completed: active.round >= active.roundsRequired, failed: active.playerHp <= 0 };
}

function tickPuzzle(quest, active, stats, logs) {
  const gain = 10 + (active.buffs.focus > 0 ? 8 : 0) + (active.buffs.prism > 0 ? 6 : 0);
  active.progress += gain;
  logs.push(`You solve ${gain} notches of the puzzle.`);
  tickBuffs(active);
  return { logs, completed: active.progress >= active.targetProgress };
}

function tickEscort(quest, active, stats, logs) {
  const progress = 8 + Math.floor(stats.defense / 3);
  const loss = Math.max(1, (quest.hazards?.integrityLoss || 7) - Math.floor(stats.attack / 8) - active.buffs.shield);
  active.progress += progress;
  active.integrity -= active.buffs.turtle > 0 ? Math.floor(loss / 2) : loss;
  logs.push(`The escort advances ${progress}; integrity ${Math.max(0, active.integrity)}.`);
  tickBuffs(active);
  return { logs, completed: active.progress >= active.targetProgress, failed: active.integrity <= 0 };
}

function advancePhaseOrComplete(quest, active, logs) {
  if (quest.type === "boss" && quest.phases && active.phaseIndex < quest.phases.length - 1) {
    active.phaseIndex += 1;
    active.enemyIndex = 0;
    active.enemies = buildPhaseEnemies(quest, active.phaseIndex);
    logs.push(quest.phases[active.phaseIndex].intro || "The fight changes shape.");
    return { logs };
  }
  return { logs, completed: true };
}

function buildPhaseEnemies(quest, phaseIndex) {
  const enemies = quest.phases?.[phaseIndex]?.enemies || quest.enemies || [];
  return enemies.map((enemy) => ({ ...enemy, hpLeft: enemy.hp }));
}

function nextEvent(quest, active) {
  return (quest.events || []).find((event) => event.round <= active.round + 1 && !active.choicesMade[event.id]);
}

function hazardDamage(quest, active) {
  const hazard = quest.hazards;
  if (!hazard || !hazard.damageEvery || active.round % hazard.damageEvery !== 0) return 0;
  return hazard.damage || 0;
}

function tickBuffs(active) {
  for (const key of Object.keys(active.buffs)) {
    active.buffs[key] = Math.max(0, active.buffs[key] - 1);
  }
}
