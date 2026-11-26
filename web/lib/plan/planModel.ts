import { foodWords, homeCovers } from "@shared/lib/pantry";

import type { IngredientChoice } from "@/lib/list/ingredientChoices";

// The plan logic both apps share (PIN-77).
export { haveCount, hubCardsNotInLibrary, mealsToSave, plannedMeals, slotKey, slotsToFill } from "@shared/lib/mealPlan/planner";

/** Everything ticked except what is at home (the pantry and "Always have"). */
export function selectionWithoutHome(choices: IngredientChoice[], homeNames: string[]): Set<string> {
  const home = homeNames.map(foodWords).filter((words) => words.length > 0);
  return new Set(
    choices
      .filter((choice) => {
        const words = foodWords(choice.name);
        return words.length === 0 || !home.some((h) => homeCovers(h, words));
      })
      .map((choice) => choice.key),
  );
}
