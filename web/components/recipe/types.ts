import type { AvoidMatches } from "@shared/lib/avoidList";
import type { MeasurementSystem } from "@shared/lib/convertMeasurement";
import type { CulinaryUnitLanguage } from "@shared/lib/culinaryUnits";
import type { RecipeLanguageCode } from "@shared/lib/recipeLanguages";
import type { Ingredient, Instruction, Recipe } from "@shared/types/recipe";

/**
 * A saved recipe as the page shows it: the stored row, with the text (title, ingredients, steps) in the app's
 * language when a saved translation exists. Amounts always come from the stored row (a translation only changes
 * words). Built by `useRecipe` (web/lib/recipe/useRecipe.ts).
 */
export type RecipeDisplay = {
  recipe: Recipe;
  title: string;
  /** At the recipe's own serving count, unscaled. */
  ingredients: Ingredient[];
  instructions: Instruction[];
  /** The language the text is in: a translation's, or the recipe's own. Null when unknown. */
  contentLanguage: RecipeLanguageCode | null;
  /** True when a saved translation into the app's language is showing. */
  translated: boolean;
  /** The recipe text's direction, which can differ from the app's (a Hebrew recipe in the English app). */
  direction: "ltr" | "rtl";
  /** The language for unit words ("cup", "כוס"): from the text shown, else the app's. */
  unitLanguage: CulinaryUnitLanguage;
};

/** What the reader chose for this recipe: how many it serves now, and spoons or grams. */
export type ReadingChoices = {
  servings: number;
  onServingsChange: (servings: number) => void;
  system: MeasurementSystem;
  onSystemChange: (system: MeasurementSystem) => void;
};

export type { AvoidMatches };
