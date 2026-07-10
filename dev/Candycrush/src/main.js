import {
  answerRiddle,
  buyFarmPlot,
  buyShopItem,
  dropCandies,
  eatCandies,
  equipItem,
  inspectBox,
  listenBox,
  plantLollipops,
  pushLighthouseColor,
  repairBridge,
  runDevCommand,
  shakeBox,
  stepCave,
  tickState,
  upgradeFarm,
  makeWish
} from "./economy.js";
import { brewRecipe, craftForgeRecipe } from "./crafting.js";
import { abandonQuest, castSpell, chooseQuestChoice, startQuest, tickQuest, usePotion } from "./quests.js";
import { clearGame, exportSave, importSave, loadGame, saveGame } from "./save.js";
import { buyRumor, inspectLocation, recordLocationVisit, triggerSecret } from "./story.js";
import { addLog } from "./utils.js";
import { renderGame } from "./ui.js";

const app = document.querySelector("#app");
let state = loadGame();
const view = {
  showImport: false,
  exportText: "",
  importError: ""
};

function render() {
  app.innerHTML = renderGame(state, view);
}

function commit() {
  tickState(state);
  saveGame(state);
  render();
}

app.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const { action, id, amount } = button.dataset;
  view.importError = "";
  if (action === "tab") state.activeTab = id;
  if (action === "command") {
    if (id?.startsWith("tab:")) state.activeTab = id.slice(4);
    if (id === "save-menu") {
      view.showImport = !view.showImport;
      view.exportText = view.exportText || exportSave(state);
    }
  }
  if (action === "inspect-box") inspectBox(state);
  if (action === "listen-box") listenBox(state);
  if (action === "shake-box") shakeBox(state);
  if (action === "toggle-log") state.ui.collapsedLog = !state.ui.collapsedLog;
  if (action === "eat") eatCandies(state);
  if (action === "drop") dropCandies(state);
  if (action === "buy") buyShopItem(state, id);
  if (action === "equip") equipItem(state, id);
  if (action === "goto") {
    state.map.current = id;
    state.map.visited[id] = true;
    recordLocationVisit(state, id);
  }
  if (action === "inspect-location") inspectLocation(state, id);
  if (action === "buy-rumor") buyRumor(state);
  if (action === "secret") triggerSecret(state, id);
  if (action === "plant") plantLollipops(state, Number(amount));
  if (action === "buy-plot") buyFarmPlot(state);
  if (action === "upgrade-farm") upgradeFarm(state);
  if (action === "repair-bridge") repairBridge(state);
  if (action === "cave") stepCave(state, id);
  if (action === "lighthouse") pushLighthouseColor(state, id);
  if (action === "wish") makeWish(state, id);
  if (action === "start-quest") startQuest(state, id);
  if (action === "quest-tick") tickQuest(state);
  if (action === "quest-choice") chooseQuestChoice(state, id);
  if (action === "potion") usePotion(state, id);
  if (action === "spell") castSpell(state, id);
  if (action === "abandon-quest") abandonQuest(state);
  if (action === "forge") craftForgeRecipe(state, id);
  if (action === "brew") brewRecipe(state, id);
  if (action === "dev") runDevCommand(state, id);
  if (action === "toggle-dark") state.darkMode = !state.darkMode;
  if (action === "save-export") {
    view.showImport = true;
    view.exportText = exportSave(state);
    addLog(state, "Save code exported.");
  }
  if (action === "save-import-panel") {
    view.showImport = !view.showImport;
    view.exportText = view.exportText || exportSave(state);
  }
  if (action === "reset" && confirm("Restart Sugarbox from the beginning?")) {
    clearGame();
    state = loadGame();
    view.showImport = false;
    view.exportText = "";
  }
  commit();
});

app.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.target;
  if (form.dataset.form === "riddle") {
    const data = new FormData(form);
    answerRiddle(state, data.get("answer"));
  }
  if (form.dataset.form === "import-save") {
    const data = new FormData(form);
    try {
      state = importSave(data.get("saveText"));
      view.showImport = false;
      view.exportText = "";
      addLog(state, "Save imported.");
    } catch {
      view.importError = "That save code could not be read.";
    }
  }
  commit();
});

setInterval(() => {
  const result = tickState(state);
  if (state.activeQuest) tickQuest(state);
  if (result.elapsed > 0 || state.activeQuest) {
    saveGame(state);
    render();
  }
}, 1000);

tickState(state);
render();
