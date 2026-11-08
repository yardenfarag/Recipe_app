import type { Recipe } from '@/types/recipe';

export type RecipeUrlOrigin = 'extracted' | 'invented';

type WithSource =
  | Pick<Recipe, 'extraction_source'>
  | { extraction_source?: string | null }
  | null
  | undefined;

export function recipeIsInvented(recipe: WithSource): boolean {
  return recipe?.extraction_source === 'invented';
}

/** A written recipe (ADR 018): typed in by the user, with no URL, photo or AI guess behind it. */
export function recipeIsWritten(recipe: WithSource): boolean {
  return recipe?.extraction_source === 'manual';
}

/**
 * Whether the recipe was read from a source (a URL or a photo). Guessed and written recipes have
 * none, so copy like "the source skipped this" and the repair action don't apply to them.
 */
export function recipeHasSource(recipe: WithSource): boolean {
  return !recipeIsInvented(recipe) && !recipeIsWritten(recipe);
}

/** The origin chip a library row shows: "Guessed", "Written", or none for a snapped recipe. */
export function recipeOriginChip(recipe: WithSource): 'invented' | 'written' | null {
  if (recipeIsInvented(recipe)) return 'invented';
  if (recipeIsWritten(recipe)) return 'written';
  return null;
}

/**
 * How a URL is matched for "already saved". A written recipe has no URL, so it never takes part in
 * URL matching and falls under 'extracted' here; backup restore matches it by title and ingredients.
 */
export function recipeUrlOrigin(
  source: string | null | undefined,
): RecipeUrlOrigin {
  return source === 'invented' ? 'invented' : 'extracted';
}

export function recipeMatchesUrlOrigin(
  recipe: { extraction_source?: string | null } | null | undefined,
  origin: RecipeUrlOrigin,
): boolean {
  return recipeUrlOrigin(recipe?.extraction_source) === origin;
}
