import { CAULDRON_RECIPES, EQUIPMENT, FORGE_RECIPES } from "./content.js";
import { addLog, hasResources, spendResources, visibleByRule } from "./utils.js";
import { equipItem } from "./economy.js";
import { recordRecipeKnown } from "./story.js";

export function availableForgeRecipes(state) {
  return FORGE_RECIPES.filter((recipe) => visibleByRule(state, recipe.visibleWhen));
}

export function availableCauldronRecipes(state) {
  return CAULDRON_RECIPES.filter((recipe) => visibleByRule(state, recipe.visibleWhen));
}

export function craftForgeRecipe(state, id) {
  const recipe = FORGE_RECIPES.find((entry) => entry.id === id);
  if (!recipe || !visibleByRule(state, recipe.visibleWhen)) return false;
  if (state.inventory.items[recipe.creates]) {
    addLog(state, "The forge refuses to make a duplicate with dramatic sparks.");
    return false;
  }
  if (!hasResources(state, recipe.cost)) {
    addLog(state, "The forge is hot, but your pockets are not ready.");
    return false;
  }
  spendResources(state, recipe.cost);
  state.inventory.items[recipe.creates] = 1;
  const item = EQUIPMENT[recipe.creates];
  if (item) equipItem(state, recipe.creates);
  recordRecipeKnown(state, recipe.id, recipe.name);
  addLog(state, `${recipe.name} forged.`);
  return true;
}

export function brewRecipe(state, id) {
  const recipe = CAULDRON_RECIPES.find((entry) => entry.id === id);
  if (!recipe || !visibleByRule(state, recipe.visibleWhen)) return false;
  if (!hasResources(state, recipe.cost)) {
    addLog(state, "The cauldron bubbles in the tone of no.");
    return false;
  }
  spendResources(state, recipe.cost);
  for (const [potion, amount] of Object.entries(recipe.output)) {
    state.inventory.potions[potion] = (state.inventory.potions[potion] || 0) + amount;
  }
  recordRecipeKnown(state, recipe.id, recipe.name);
  addLog(state, `${recipe.name} bottled.`);
  return true;
}
