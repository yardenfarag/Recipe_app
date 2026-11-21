import type { AvoidMatches } from "@shared/lib/avoidList";
import type { MeasurementSystem } from "@shared/lib/convertMeasurement";
import type { CulinaryUnitLanguage } from "@shared/lib/culinaryUnits";
import { displayedAmountIsPinch, displayIngredientAmount, recipeHasUnknownAmounts } from "@shared/lib/displayIngredientAmount";
import { scaleIngredients } from "@shared/lib/ingredientAmounts";
import { isRtlRecipeLanguage } from "@shared/lib/recipeLanguages";
import type { Ingredient } from "@shared/types/recipe";

export type IngredientRow = {
  key: string;
  name: string;
  /** The amount as the mobile app shows it ("1½ cups", "200 g", "a pinch"). Empty when the source never said. */
  amount: string;
  /** The amount reads as the word pinch, which mobile highlights. */
  isPinch: boolean;
  avoid: "allergy" | "dislike" | null;
};

export type IngredientRowsInput = {
  ingredients: Ingredient[];
  /** The recipe's own count, which the stored amounts are for. */
  recipeServings: number;
  servings: number;
  system: MeasurementSystem;
  unitLanguage: CulinaryUnitLanguage;
  avoid: AvoidMatches | null;
};

/**
 * The ingredient rows at the chosen serving count and measuring system, the way the mobile recipe screen
 * (src/components/RecipeView.tsx) builds them: scale every amount from the recipe's own count, then show each one
 * in the chosen system with unit words in the recipe text's language.
 */
export function ingredientRows({ ingredients, recipeServings, servings, system, unitLanguage, avoid }: IngredientRowsInput): {
  rows: IngredientRow[];
  hasUnknownAmounts: boolean;
} {
  const scaled = scaleIngredients(ingredients, recipeServings, servings);
  const rows = scaled.map((ingredient, index) => ({
    key: `${index}-${ingredient.name}`,
    name: ingredient.name,
    amount: displayIngredientAmount(ingredient, { system, language: unitLanguage }),
    isPinch: displayedAmountIsPinch(ingredient, { system }),
    avoid: avoid?.byIngredient[index] ?? null,
  }));
  return { rows, hasUnknownAmounts: recipeHasUnknownAmounts(scaled, system) };
}

/**
 * The direction to set on an amount. One with words ("2 cups", "2 כוסות", "to taste") follows its own first
 * letter; a bare number ("3", "1½") takes the unit language's, so it lines up with the words around it.
 */
export function amountDirection(amount: string, unitLanguage: CulinaryUnitLanguage): "ltr" | "rtl" | "auto" {
  if (/\p{L}/u.test(amount)) return "auto";
  return isRtlRecipeLanguage(unitLanguage) ? "rtl" : "ltr";
}
