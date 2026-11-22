import type { UnitSystem } from "@shared/lib/unitSystem";
import type { MeasurementSystem } from "@shared/lib/convertMeasurement";
import type { CulinaryUnitLanguage } from "@shared/lib/culinaryUnits";
import { displayIngredientAmount } from "@shared/lib/displayIngredientAmount";
import { isPantryStaple } from "@shared/lib/pantryStaples";
import type { ShoppingListIncomingItem } from "@shared/types/shoppingList";
import type { Ingredient } from "@shared/types/recipe";

import { ingredientToListItem } from "@/lib/list/shoppingListView";

/** One ingredient offered for the list: how it reads in the picker, and the line it becomes. */
export type IngredientChoice = {
  key: string;
  name: string;
  /** As the recipe shows it ("1½ cups"). Empty when the source never said. */
  amount: string;
  item: ShoppingListIncomingItem;
};

/**
 * The ingredients of one recipe as choices, at the amounts given (already scaled, if the recipe page scaled them)
 * and in the measuring system the person reads in.
 */
export function ingredientChoices(
  ingredients: Ingredient[],
  options: {
    system: MeasurementSystem;
    unitLanguage: CulinaryUnitLanguage;
    recipeId?: string;
    keyPrefix?: string;
    /** Metric or US weights in Spoons mode (PIN-53). */
    units?: UnitSystem;
  },
): IngredientChoice[] {
  return ingredients
    .filter((ingredient) => ingredient.name?.trim())
    .map((ingredient, index) => ({
      key: `${options.keyPrefix ?? options.recipeId ?? "r"}:${index}`,
      name: ingredient.name,
      amount: displayIngredientAmount(ingredient, { system: options.system, language: options.unitLanguage, units: options.units }),
      item: ingredientToListItem(ingredient, options.system, options.recipeId, options.units),
    }));
}

/** Everything ticked except what the person keeps at home, as on mobile. */
export function initialSelection(choices: IngredientChoice[], staples: string[]): Set<string> {
  return new Set(choices.filter((choice) => !isPantryStaple(choice.name, staples)).map((choice) => choice.key));
}
