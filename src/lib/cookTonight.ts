import type { EffortLevel, Recipe } from '@/types/recipe';

export type CookTonightFilters = {
  maxMinutes?: number | null;
  maxEffort?: EffortLevel | null;
  minServings?: number | null;
  /** Recipe tags that must all match (e.g. vegan). */
  requiredTags?: string[];
  favoritesOnly?: boolean;
};

const EFFORT_RANK: Record<EffortLevel, number> = { Easy: 0, Medium: 1, Hard: 2 };

/**
 * Rank saved recipes for a weeknight cook. Returns null when the recipe
 * fails a hard filter. Higher scores are a better fit.
 */
export function scoreCookTonight(recipe: Recipe, filters: CookTonightFilters): number | null {
  if (filters.favoritesOnly && !recipe.is_favorite) return null;

  if (filters.maxMinutes != null) {
    if (recipe.estimated_time_minutes == null) return null;
    if (recipe.estimated_time_minutes > filters.maxMinutes) return null;
  }

  if (filters.maxEffort) {
    if (!recipe.effort_level) return null;
    if (EFFORT_RANK[recipe.effort_level] > EFFORT_RANK[filters.maxEffort]) return null;
  }

  if (filters.minServings != null && recipe.servings < filters.minServings) return null;

  const tags = new Set((recipe.tags ?? []).map((tag) => tag.trim().toLowerCase()));
  for (const required of filters.requiredTags ?? []) {
    const key = required.trim().toLowerCase();
    if (key && !tags.has(key)) return null;
  }

  let score = 0;
  if (recipe.is_favorite) score += 8;
  if (recipe.effort_level === 'Easy') score += 5;
  else if (recipe.effort_level === 'Medium') score += 2;
  if (recipe.estimated_time_minutes != null) {
    if (recipe.estimated_time_minutes <= 20) score += 6;
    else if (recipe.estimated_time_minutes <= 40) score += 3;
  }
  if (recipe.cost_estimate === '$') score += 2;
  return score;
}

export function rankCookTonight(recipes: Recipe[], filters: CookTonightFilters): Recipe[] {
  return recipes
    .map((recipe) => ({ recipe, score: scoreCookTonight(recipe, filters) }))
    .filter((row): row is { recipe: Recipe; score: number } => row.score != null)
    .sort((a, b) => b.score - a.score || a.recipe.title.localeCompare(b.recipe.title))
    .map((row) => row.recipe);
}
