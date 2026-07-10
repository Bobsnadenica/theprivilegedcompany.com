import {
  ASCII,
  CAULDRON_RECIPES,
  CAVE_SEQUENCE,
  DEV_COMMANDS,
  EQUIPMENT,
  FORGE_RECIPES,
  LIGHTHOUSE_SEQUENCE,
  MAP_NODES,
  QUESTS,
  RESOURCE_LABELS,
  RIDDLES,
  SHOP_ITEMS,
  WISHES
} from "./content.js";
import { deriveStats, getLollipopRate } from "./economy.js";
import { estimateFarmCapacity } from "./balance.js";
import { availableQuests, getQuest } from "./quests.js";
import { formatCost, formatNumber, hasResources, ownsItem, requirementMet, visibleByRule } from "./utils.js";
import { getJournalSummary } from "./story.js";
import {
  canUseSaveMenu,
  getAvailableCommands,
  getFoggedMapNodes,
  getVisibleResources,
  getVisibleSurfaces,
  migrateUiProgress
} from "./progression.js";

export function renderGame(state, view = {}) {
  migrateUiProgress(state);
  document.body.classList.toggle("dark", state.darkMode);
  const surfaces = getVisibleSurfaces(state);
  const activeSurface = surfaces.includes(state.activeTab) ? state.activeTab : "box";
  const asideVisible = view.showImport || shouldShowLog(state);
  return `
    <main class="game-shell stage-${state.ui.stage} ${asideVisible ? "has-aside" : ""}">
      <section class="play-column">
        ${renderHeader(state)}
        ${renderStatus(state)}
        ${renderReveal(state)}
        ${renderCurrentSurface(state, view, activeSurface)}
        ${renderCommandRow(state, activeSurface)}
      </section>
      ${asideVisible ? `<aside class="side-drawer">${renderSidePanel(state, view)}</aside>` : ""}
    </main>
  `;
}

function renderHeader(state) {
  if (!state.flags.boxInspected) return "";
  return `
    <header class="minimal-header">
      <h1>Sugarbox</h1>
      <p>${subtitle(state)}</p>
    </header>
  `;
}

function subtitle(state) {
  if (state.unlocks.endgame) return "the game behind the game";
  if (state.map.unlocked.includes("hollowOrchard")) return "a final road has opened";
  if (state.unlocks.map) return "the box is bigger inside";
  if (state.unlocks.shop) return "something is unfolding";
  return "candies arrive one by one";
}

function renderStatus(state) {
  return `
    <div class="status-strip" aria-label="Resources">
      ${getVisibleResources(state)
        .map(
          (key) => `
            <div class="resource-pill">
              <span>${RESOURCE_LABELS[key]}</span>
              <b>${formatNumber(state.resources[key])}</b>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderReveal(state) {
  if (!state.ui.lastReveal) return "";
  return `<p class="reveal-line">${escapeHtml(state.ui.lastReveal)}</p>`;
}

function renderCommandRow(state, activeSurface) {
  const commands = getAvailableCommands(state);
  const canToggleLog = state.flags.boxInspected || state.log.length > 2 || state.unlocks.shop;
  const actionCommands = commands.filter((command) => command.kind === "primary" || command.kind === "quiet");
  const surfaceCommands = commands.filter((command) => command.kind === "surface");
  const systemCommands = commands.filter((command) => command.kind === "system");
  if (canToggleLog) {
    systemCommands.push({
      id: "toggle-log",
      label: state.ui.collapsedLog ? "log" : "hide log",
      kind: "system"
    });
  }
  return `
    <nav class="command-row" aria-label="Commands">
      ${renderCommandGroup(actionCommands, activeSurface, "actions")}
      ${renderCommandGroup(surfaceCommands, activeSurface, "surfaces")}
      ${renderCommandGroup(systemCommands, activeSurface, "systems")}
    </nav>
  `;
}

function renderCommandGroup(commands, activeSurface, group) {
  if (!commands.length) return "";
  return `
    <div class="command-group command-group-${group}">
      ${commands.map((command) => renderCommandButton(command, activeSurface)).join("")}
    </div>
  `;
}

function renderCommandButton(command, activeSurface) {
  const isCommand = command.id.startsWith("tab:") || command.id === "save-menu";
  const isSecret = command.id.startsWith("secret:");
  const action = isCommand ? "command" : isSecret ? "secret" : command.id;
  const active = command.surface && command.surface === activeSurface ? "active" : "";
  const dataId = isCommand || isSecret ? `data-id="${isSecret ? command.id.slice(7) : command.id}"` : "";
  return `<button class="${command.kind} ${active}" data-action="${action}" ${dataId}>${command.label}</button>`;
}

function renderCurrentSurface(state, view, activeSurface) {
  if (activeSurface === "shop") return renderShop(state);
  if (activeSurface === "inventory") return renderInventory(state);
  if (activeSurface === "map") return renderMap(state);
  if (activeSurface === "journal") return renderJournal(state);
  if (activeSurface === "farm") return renderFarm(state);
  if (activeSurface === "quests") return renderQuests(state);
  if (activeSurface === "forge") return renderForge(state);
  if (activeSurface === "cauldron") return renderCauldron(state);
  if (activeSurface === "console") return renderConsole(state);
  return renderBox(state);
}

function renderBox(state) {
  if (!state.flags.boxInspected) {
    return `
      <section class="box-stage intro">
        <div class="ascii-stage"><pre>${ASCII.sugarbox}</pre></div>
      </section>
    `;
  }
  return `
    <section class="box-stage">
      <div class="ascii-stage"><pre>${ASCII.sugarbox}</pre></div>
      <div class="box-copy">
        <h2>The box</h2>
        <p>${boxText(state)}</p>
        ${state.stats.candiesDropped >= 10 ? `<p class="muted">Candies dropped: ${formatNumber(state.stats.candiesDropped)}</p>` : ""}
        ${state.stats.candiesEaten >= 20 ? `<p class="good">Eating has made you harder to discourage.</p>` : ""}
      </div>
    </section>
  `;
}

function boxText(state) {
  if (!state.unlocks.shop) return "There is a folded corner, a quiet sound, and room for more candies.";
  if (!state.unlocks.map) return "The box is getting crowded. A shop sign keeps trying to look casual.";
  if (!state.unlocks.endgame) return "The box now contains roads, tools, arguments, and a suspicious amount of destiny.";
  return "The box survived the orchard. It is trying to look humble.";
}

function renderShop(state) {
  return `
    <section class="surface-panel">
      <h2>The shop</h2>
      <div class="card-grid">
        ${SHOP_ITEMS.filter((item) => visibleByRule(state, item.visibleWhen))
          .map((item) => {
            const count = state.purchases[item.id] || 0;
            const soldOut = item.max && count >= item.max;
            const disabled = soldOut || !hasResources(state, item.cost);
            return `
              <div class="card">
                <h3>${item.name}</h3>
                <p>${item.description}</p>
                <p class="cost">${soldOut ? "sold out" : formatCost(item.cost)}</p>
                <button data-action="buy" data-id="${item.id}" ${disabled ? "disabled" : ""}>${soldOut ? "owned" : "buy"}</button>
              </div>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function renderInventory(state) {
  const stats = deriveStats(state);
  const owned = Object.keys(state.inventory.items).filter((id) => EQUIPMENT[id]);
  return `
    <section class="surface-panel">
      <h2>Inventory</h2>
      <div class="stat-line">
        <span>hp ${formatNumber(stats.maxHp)}</span>
        <span>atk ${formatNumber(stats.attack)}</span>
        <span>def ${formatNumber(stats.defense)}</span>
        <span>${stats.candyRate.toFixed(1)} candy/sec</span>
      </div>
      <h3>Equipment</h3>
      <div class="card-grid">
        ${owned
          .map((id) => {
            const item = EQUIPMENT[id];
            const equipped = Object.values(state.equipment).includes(id);
            return `
              <div class="card">
                <h3>${item.name}</h3>
                <p class="muted">${item.slot} | atk +${item.attack || 0}, def +${item.defense || 0}${item.maxHp ? `, hp +${item.maxHp}` : ""}${item.candyRate ? `, candy/sec +${item.candyRate}` : ""}</p>
                <button data-action="equip" data-id="${id}" ${equipped ? "disabled" : ""}>${equipped ? "equipped" : "equip"}</button>
              </div>
            `;
          })
          .join("")}
      </div>
      <h3>Potions and spells</h3>
      <p>${formatPotions(state)}</p>
      <p>Spells: ${state.inventory.spells.length ? state.inventory.spells.join(", ") : "none"}</p>
    </section>
  `;
}

function renderMap(state) {
  const current = MAP_NODES.find((node) => node.id === state.map.current) || MAP_NODES[0];
  return `
    <section class="map-surface">
      <div>
        <div class="ascii-stage"><pre>${ASCII[current.art]}</pre></div>
        <div class="surface-panel">
          <h2>${current.name}</h2>
          <p>${current.description}</p>
          <button data-action="inspect-location" data-id="${current.id}">inspect here</button>
          ${renderLocationActions(state, current.id)}
        </div>
      </div>
      <div class="surface-panel">
        <h2>Map</h2>
        <div class="map-grid">
          ${getFoggedMapNodes(state)
            .map((node) =>
              node.fogged
                ? `<button class="map-node fogged" disabled>????</button>`
                : `<button class="map-node ${node.id === state.map.current ? "current" : ""}" data-action="goto" data-id="${node.id}">${node.name}</button>`
            )
            .join("")}
        </div>
      </div>
    </section>
  `;
}

function renderLocationActions(state, id) {
  if (id === "brokenBridge") {
    return state.flags.bridgeRepaired
      ? `<p class="good">The bridge is repaired. The forest road is open.</p>`
      : `<button data-action="repair-bridge" ${hasResources(state, { candies: 500, lollipops: 120 }) ? "" : "disabled"}>repair bridge (500 candies, 120 lollipops)</button>`;
  }
  if (id === "whisperingForest") return renderRiddle(state);
  if (id === "saltCave") return renderCavePuzzle(state);
  if (id === "lighthouse") return renderLighthouse(state);
  if (id === "moonWell") return renderWishes(state);
  if (id === "hollowOrchard") {
    return state.quests.completed.finalOrchard
      ? `<p class="good">The orchard has no more hunger.</p>`
      : `<p class="warn">The final quest waits in quests.</p>`;
  }
  const localQuests = QUESTS.filter((quest) => quest.location === id && requirementMet(state, quest.unlock));
  if (localQuests.length) return `<p class="muted">${localQuests.length} quest${localQuests.length > 1 ? "s" : ""} available here.</p>`;
  return `<p class="muted">Nothing here is ready to admit it is important.</p>`;
}

function renderJournal(state) {
  const journal = getJournalSummary(state);
  return `
    <section class="surface-panel">
      <h2>Journal</h2>
      <p class="muted">Notes appear only after you have touched the edge of a thing.</p>
      <div class="action-grid">
        <button data-action="buy-rumor" ${hasResources(state, { lollipops: 40 }) ? "" : "disabled"}>buy a rumor</button>
      </div>
      <h3>Locations</h3>
      ${journal.locations.length ? journal.locations.map(([id, entry]) => `<p><b>${id}</b>: ${(entry.notes || []).slice(-2).join(" / ") || "visited"}</p>`).join("") : `<p class="muted">No location notes yet.</p>`}
      <h3>Quests</h3>
      ${journal.quests.length ? journal.quests.map((quest) => `<p>${quest.name} (${quest.type || "combat"})</p>`).join("") : `<p class="muted">No quest notes yet.</p>`}
      <h3>Rumors and mysteries</h3>
      ${journal.rumors.concat(journal.mysteries).length ? journal.rumors.concat(journal.mysteries).map((line) => `<p>${line}</p>`).join("") : `<p class="muted">No rumors bought yet.</p>`}
      <h3>Recipes and puzzles</h3>
      <p>${journal.recipes.length ? journal.recipes.join(", ") : "No recipes recorded."}</p>
      <p>${journal.puzzles.length ? journal.puzzles.map(([, note]) => note).join(" / ") : "No puzzle notes recorded."}</p>
      <h3>Endings</h3>
      <p>${journal.endings.length ? journal.endings.map((ending) => ending.label).join(", ") : "No endings discovered."}</p>
    </section>
  `;
}

function renderRiddle(state) {
  const riddle = RIDDLES[state.puzzles.riddleStep];
  if (!riddle) return `<p class="good">The trees have answered back with silence and sugar glass.</p>`;
  return `
    <div class="notice">
      <p>${riddle.prompt}</p>
      <form class="inline-form" data-form="riddle">
        <input name="answer" autocomplete="off" aria-label="Riddle answer">
        <button>answer</button>
      </form>
    </div>
  `;
}

function renderCavePuzzle(state) {
  if (state.flags.caveSolved) return `<p class="good">The safe path is open. Sequence solved: ${CAVE_SEQUENCE.join(", ")}.</p>`;
  return `
    <p>Progress: ${state.puzzles.caveProgress.length}/${CAVE_SEQUENCE.length}</p>
    <div class="action-grid">
      ${["north", "south", "east", "west"].map((dir) => `<button data-action="cave" data-id="${dir}">${dir}</button>`).join("")}
    </div>
  `;
}

function renderLighthouse(state) {
  if (state.flags.lighthouseSolved) return `<p class="good">The beam points cleanly to the pier.</p>`;
  return `
    <p>Lens sequence: ${state.puzzles.lighthouseProgress.length}/${LIGHTHOUSE_SEQUENCE.length}</p>
    <div class="action-grid">
      ${["red", "blue", "green"].map((color) => `<button data-action="lighthouse" data-id="${color}">${color}</button>`).join("")}
    </div>
  `;
}

function renderWishes(state) {
  return `
    <div class="card-grid">
      ${WISHES.map((wish) => {
        const count = state.puzzles.wishes[wish.id] || 0;
        const done = wish.max && count >= wish.max;
        return `
          <div class="card">
            <h3>${wish.name}</h3>
            <p class="cost">${done ? "granted" : formatCost(wish.cost)}</p>
            <button data-action="wish" data-id="${wish.id}" ${done || !hasResources(state, wish.cost) ? "disabled" : ""}>wish</button>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderFarm(state) {
  const capacity = estimateFarmCapacity(state.farm.plots, state.farm.upgrades);
  const rate = getLollipopRate(state);
  return `
    <section class="map-surface">
      <div class="ascii-stage"><pre>${ASCII.farm}</pre></div>
      <div class="surface-panel">
        <h2>Orchard farm</h2>
        <p>Plots: ${state.farm.plots} | planted: ${formatNumber(state.farm.planted)} / ${formatNumber(capacity)}</p>
        <p>Lollipops/sec: ${rate.toFixed(2)}</p>
        <div class="action-grid">
          <button data-action="plant" data-amount="10">plant 10</button>
          <button data-action="plant" data-amount="100">plant 100</button>
          <button data-action="buy-plot">buy plot</button>
          <button data-action="upgrade-farm">upgrade farm</button>
        </div>
      </div>
    </section>
  `;
}

function renderQuests(state) {
  if (state.activeQuest) return renderActiveQuest(state);
  const quests = availableQuests(state);
  return `
    <section class="surface-panel">
      <h2>Quests</h2>
      <div class="card-grid">
        ${quests
          .map((quest) => {
            const completed = state.quests.completed[quest.id] || 0;
            return `
              <div class="card">
                <h3>${quest.name}</h3>
                <p>${quest.description}</p>
                <p class="cost">${quest.type || "combat"} | rewards: ${formatCost(quest.rewards)}</p>
                <p class="muted">completed: ${completed}</p>
                <button data-action="start-quest" data-id="${quest.id}">begin</button>
              </div>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function renderActiveQuest(state) {
  const active = state.activeQuest;
  const quest = getQuest(active.id);
  const enemy = active.enemies?.[active.enemyIndex];
  return `
    <section class="surface-panel">
      <h2>${quest.name}</h2>
      <div class="bar"><span style="width:${Math.max(0, (active.playerHp / active.maxHp) * 100)}%"></span><b>${Math.max(0, active.playerHp)} / ${active.maxHp}</b></div>
      ${active.progress ? `<p>Progress: ${Math.floor(active.progress)} / ${active.targetProgress}</p>` : ""}
      ${active.type === "escort" ? `<p>Integrity: ${Math.max(0, active.integrity)}%</p>` : ""}
      ${enemy ? `<p>Enemy: ${enemy.name}</p><div class="bar"><span style="width:${Math.max(0, (enemy.hpLeft / enemy.hp) * 100)}%"></span><b>${Math.max(0, enemy.hpLeft)} / ${enemy.hp}</b></div>` : ""}
      ${active.pendingChoice ? renderQuestChoice(active) : renderQuestActions(state)}
      <div class="quest-log">
        ${active.log.map((line) => `<div class="log-line">${escapeHtml(line)}</div>`).join("")}
      </div>
    </section>
  `;
}

function renderQuestChoice(active) {
  return `
    <div class="notice">
      <p>${active.pendingChoice.text}</p>
      <div class="action-grid">
        ${active.pendingChoice.choices.map((choice) => `<button data-action="quest-choice" data-id="${choice.id}">${choice.label}</button>`).join("")}
      </div>
    </div>
  `;
}

function renderQuestActions(state) {
  return `
    <div class="action-grid">
      <button data-action="quest-tick">wait a round</button>
      ${Object.entries(state.inventory.potions)
        .filter(([, count]) => count > 0)
        .map(([id, count]) => `<button data-action="potion" data-id="${id}">${id} (${count})</button>`)
        .join("")}
      ${state.inventory.spells.map((spell) => `<button data-action="spell" data-id="${spell}">${spell}</button>`).join("")}
      <button data-action="abandon-quest">leave</button>
    </div>
  `;
}

function renderForge(state) {
  const recipes = FORGE_RECIPES.filter((recipe) => visibleByRule(state, recipe.visibleWhen));
  return `
    <section class="surface-panel">
      <h2>The forge</h2>
      <div class="card-grid">
        ${recipes
          .map((recipe) => {
            const owned = ownsItem(state, recipe.creates);
            return `
              <div class="card">
                <h3>${recipe.name}</h3>
                <p>${recipe.description}</p>
                <p class="cost">${owned ? "owned" : formatCost(recipe.cost)}</p>
                <button data-action="forge" data-id="${recipe.id}" ${owned || !hasResources(state, recipe.cost) ? "disabled" : ""}>forge</button>
              </div>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function renderCauldron(state) {
  const recipes = CAULDRON_RECIPES.filter((recipe) => visibleByRule(state, recipe.visibleWhen));
  return `
    <section class="surface-panel">
      <h2>Cauldron</h2>
      <div class="card-grid">
        ${recipes
          .map(
            (recipe) => `
              <div class="card">
                <h3>${recipe.name}</h3>
                <p>${recipe.description}</p>
                <p class="cost">${formatCost(recipe.cost)}</p>
                <button data-action="brew" data-id="${recipe.id}" ${hasResources(state, recipe.cost) ? "" : "disabled"}>brew</button>
              </div>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderConsole(state) {
  return `
    <section class="surface-panel">
      <h2>Developer console</h2>
      <div class="ascii-stage compact"><pre>function reality() {
  return bugs.makeUseful();
}</pre></div>
      <div class="card-grid">
        ${DEV_COMMANDS.map((command) => {
          const used = command.once && state.puzzles.devCommands[command.id];
          return `
            <div class="card">
              <h3>${command.name}</h3>
              <p class="cost">${used ? "already executed" : formatCost(command.cost)}</p>
              <button data-action="dev" data-id="${command.id}" ${used || !hasResources(state, command.cost) ? "disabled" : ""}>run</button>
            </div>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function renderSidePanel(state, view) {
  if (view.showImport) {
    return `
      <h2>Save</h2>
      <div class="save-tools">
        <button data-action="toggle-dark">${state.darkMode ? "light" : "dark"}</button>
        <button data-action="save-export">export</button>
        <button data-action="reset">restart</button>
      </div>
      ${view.exportText ? `<textarea readonly>${escapeHtml(view.exportText)}</textarea>` : ""}
      <form data-form="import-save">
        <textarea name="saveText" placeholder="paste save code"></textarea>
        <button>import</button>
      </form>
      ${view.importError ? `<p class="bad">${escapeHtml(view.importError)}</p>` : ""}
    `;
  }
  return `
    <h2>Log</h2>
    <div class="log">
      ${state.log.slice().reverse().map((line) => `<div class="log-line">${escapeHtml(line)}</div>`).join("")}
    </div>
    ${state.activeQuest ? `<p class="warn">A quest is active. It advances every few seconds.</p>` : ""}
  `;
}

function shouldShowLog(state) {
  return !state.ui.collapsedLog && (state.flags.boxInspected || state.log.length > 2 || state.activeQuest);
}

function formatPotions(state) {
  const entries = Object.entries(state.inventory.potions).filter(([, count]) => count > 0);
  return entries.length ? entries.map(([id, count]) => `${id} ${count}`).join(" | ") : "No potions bottled.";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
