import type { Ingredient, Instruction, Recipe } from '@/types/recipe';

type RecipeContentSnapshot = {
  title: string;
  servings: number;
  ingredients: Ingredient[];
  instructions: Instruction[];
  calories?: number | null;
};

/** Treat missing / null calories as the same for echo comparisons. */
function normalizeCalories(value: number | null | undefined): number | null {
  return value == null ? null : value;
}

/**
 * True when a RecipeView content echo matches the canonical recipe.
 * Used to skip no-op persists that would otherwise wipe translation overlays.
 */
export function recipeContentEquals(
  recipe: Pick<Recipe, 'title' | 'servings' | 'ingredients' | 'instructions' | 'calories'>,
  content: RecipeContentSnapshot,
): boolean {
  return (
    content.title === recipe.title &&
    content.servings === recipe.servings &&
    normalizeCalories(content.calories) === normalizeCalories(recipe.calories) &&
    JSON.stringify(content.ingredients) === JSON.stringify(recipe.ingredients) &&
    JSON.stringify(content.instructions) === JSON.stringify(recipe.instructions)
  );
}
