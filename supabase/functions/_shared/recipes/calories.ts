/** Below this kcal/serving, the stored total is likely mislabeled (per-serving stored as total). */
const MIN_PLAUSIBLE_PER_SERVING = 20;

/** Typical per-portion kcal range for a single serving of real food. */
const PER_SERVING_LIKELY_MIN = 40;
const PER_SERVING_LIKELY_MAX = 900;

/**
 * `recipe.calories` is stored as TOTAL kcal for `recipe.servings` portions.
 * Gemini sometimes returns per-serving kcal in the calories field when
 * servings is a large yield count (e.g. 48 cookies).
 */
export function resolveRecipeCalories(
  calories: number,
  servings: number,
): { totalCalories: number; perServing: number } {
  const safeServings = Math.max(1, Math.round(servings));
  const naivePerServing = calories / safeServings;

  const looksMislabeled =
    naivePerServing < MIN_PLAUSIBLE_PER_SERVING &&
    calories >= PER_SERVING_LIKELY_MIN &&
    calories <= PER_SERVING_LIKELY_MAX &&
    safeServings >= 4;

  if (looksMislabeled) {
    return {
      totalCalories: Math.round(calories * safeServings),
      perServing: Math.round(calories),
    };
  }

  return {
    totalCalories: Math.round(calories),
    perServing: Math.max(1, Math.round(naivePerServing)),
  };
}

/** Normalize before persisting an extracted recipe. */
export function normalizeStoredCalories(
  calories: number | null | undefined,
  servings: number,
): number | null {
  if (calories == null) return null;
  return resolveRecipeCalories(calories, servings).totalCalories;
}
