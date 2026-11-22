import type { Recipe, RecipeNutrition } from '../types/recipe';
import { RECIPE_LIMITS } from './recipeLimits';

const KEYS = ['protein_g', 'carbs_g', 'fat_g'] as const;

/**
 * The stored shape in whole grams, or null (PIN-80). Use on anything read from storage, a backup
 * or a share: the database CHECK mirrors it.
 */
export function parseRecipeNutrition(value: unknown): RecipeNutrition | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const out: Partial<RecipeNutrition> = {};
  for (const key of KEYS) {
    const amount = record[key];
    if (typeof amount !== 'number' || !Number.isFinite(amount)) return null;
    const grams = Math.round(amount);
    if (grams < 0 || grams > RECIPE_LIMITS.nutritionGramsMax) return null;
    out[key] = grams;
  }
  return out as RecipeNutrition;
}

/**
 * The macros to show, or null. They are a split of Pinch's calorie estimate, so a recipe without
 * calories, or with calories the user set by hand, shows none (until "reset to Pinch's estimate").
 */
export function recipeNutritionOf(
  recipe: Pick<Recipe, 'calories' | 'nutrition' | 'locked_fields'>,
): RecipeNutrition | null {
  if (recipe.calories == null) return null;
  if (recipe.locked_fields?.includes('calories')) return null;
  return parseRecipeNutrition(recipe.nutrition);
}

export interface NutritionDisplay {
  /** Fixed: one serving of the recipe as written. */
  perServing: RecipeNutrition;
  /** For the servings chosen on the stepper. */
  total: RecipeNutrition;
}

/** Like getCalorieDisplay: per serving stays, the total scales with the chosen servings. */
export function getNutritionDisplay(
  nutrition: RecipeNutrition | null | undefined,
  recipeServings: number,
  activeServings: number,
): NutritionDisplay | null {
  const stored = parseRecipeNutrition(nutrition);
  if (!stored) return null;
  const servings = Math.max(1, recipeServings);
  const scale = (factor: number): RecipeNutrition => ({
    protein_g: Math.round((stored.protein_g / servings) * factor),
    carbs_g: Math.round((stored.carbs_g / servings) * factor),
    fat_g: Math.round((stored.fat_g / servings) * factor),
  });
  return { perServing: scale(1), total: scale(Math.max(0, activeServings)) };
}
