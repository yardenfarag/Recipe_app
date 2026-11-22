import type { Ingredient, Instruction, Recipe, RecipeNutrition } from '../types/recipe';
import { parseRecipeNutrition } from './recipeNutrition';

type RecipeContentSnapshot = {
  title: string;
  servings: number;
  ingredients: Ingredient[];
  instructions: Instruction[];
  calories?: number | null;
  /** PIN-80. Absent = not part of this echo (compared only when present). */
  nutrition?: RecipeNutrition | null;
};

/** Treat missing / null calories as the same for echo comparisons. */
function normalizeCalories(value: number | null | undefined): number | null {
  return value == null ? null : value;
}

function sameNutrition(a: unknown, b: unknown): boolean {
  return JSON.stringify(parseRecipeNutrition(a)) === JSON.stringify(parseRecipeNutrition(b));
}

/**
 * True when a RecipeView content echo matches the canonical recipe.
 * Used to skip no-op persists that would otherwise wipe translation overlays.
 */
export function recipeContentEquals(
  recipe: Pick<Recipe, 'title' | 'servings' | 'ingredients' | 'instructions' | 'calories' | 'nutrition'>,
  content: RecipeContentSnapshot,
): boolean {
  return (
    content.title === recipe.title &&
    content.servings === recipe.servings &&
    normalizeCalories(content.calories) === normalizeCalories(recipe.calories) &&
    (content.nutrition === undefined || sameNutrition(content.nutrition, recipe.nutrition)) &&
    JSON.stringify(content.ingredients) === JSON.stringify(recipe.ingredients) &&
    JSON.stringify(content.instructions) === JSON.stringify(recipe.instructions)
  );
}
