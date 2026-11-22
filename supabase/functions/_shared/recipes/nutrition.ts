/**
 * Protein, carbs and fat (PIN-80). The model call that estimates a recipe's calories returns them
 * too, as grams for ALL servings, like `calories`. They are stored in `recipes.nutrition` and
 * `recipe_cards.nutrition` only next to a calorie estimate they fit.
 */

import { caloriesLookPerServing } from './calories.ts';
import { fitNutrition, type RecipeNutrition } from './recipeLimits.ts';

export type { RecipeNutrition };

/**
 * How far the macros' own kcal (4 per gram of protein and carbs, 9 per gram of fat) may be from
 * the calorie estimate before they are dropped. Alcohol and fibre explain smaller gaps.
 */
export const NUTRITION_MAX_MISMATCH = 0.35;

/** The prompt rule, next to CALORIE_RULES wherever the model estimates calories. */
export const NUTRITION_RULES = `- protein_g, carbs_g, fat_g: grams for ALL portions at the stated servings (totals, like calories), from the ingredient amounts. They must fit calories: protein×4 + carbs×4 + fat×9 ≈ calories. If the source states nutrition per serving (for example JSON-LD "nutrition" or a nutrition panel), use it and multiply by servings.`;

/** Schema properties, placed after `calories` so the calorie estimate comes first. Never required. */
export const NUTRITION_SCHEMA_PROPERTIES = {
  protein_g: { type: 'integer' },
  carbs_g: { type: 'integer' },
  fat_g: { type: 'integer' },
} as const;

export interface RawNutrition {
  calories?: unknown;
  protein_g?: unknown;
  carbs_g?: unknown;
  fat_g?: unknown;
}

export function nutritionKcal(nutrition: RecipeNutrition): number {
  return nutrition.protein_g * 4 + nutrition.carbs_g * 4 + nutrition.fat_g * 9;
}

/** True when the macros add up to within NUTRITION_MAX_MISMATCH of the total calories. */
export function nutritionFitsCalories(nutrition: RecipeNutrition, totalCalories: number): boolean {
  const implied = nutritionKcal(nutrition);
  // A recipe of about nothing (tea, broth) has no meaningful ratio.
  if (totalCalories < 50) return implied < 50 + totalCalories;
  return Math.abs(implied - totalCalories) / totalCalories <= NUTRITION_MAX_MISMATCH;
}

/**
 * Model output → stored nutrition, or null. Needs the calories from the same answer: when they look
 * like one serving's (calories.ts), the macros get the same correction. Macros that don't fit the
 * calories are dropped and the calories stay.
 */
export function normalizeStoredNutrition(raw: RawNutrition, servings: number): RecipeNutrition | null {
  const calories = typeof raw.calories === 'number' && Number.isFinite(raw.calories) ? raw.calories : null;
  if (calories === null || calories < 0) return null;
  const grams = [raw.protein_g, raw.carbs_g, raw.fat_g];
  if (!grams.every((g) => typeof g === 'number' && Number.isFinite(g) && g >= 0)) return null;
  const factor = caloriesLookPerServing(calories, servings) ? Math.max(1, Math.round(servings)) : 1;
  const nutrition = fitNutrition({
    protein_g: (raw.protein_g as number) * factor,
    carbs_g: (raw.carbs_g as number) * factor,
    fat_g: (raw.fat_g as number) * factor,
  });
  if (!nutrition) return null;
  return nutritionFitsCalories(nutrition, Math.round(calories * factor)) ? nutrition : null;
}
