import type { Recipe } from '@/types/recipe';

export type RecipeUrlOrigin = 'extracted' | 'invented';

export function recipeIsInvented(
  recipe: Pick<Recipe, 'extraction_source'> | { extraction_source?: string } | null | undefined,
): boolean {
  return recipe?.extraction_source === 'invented';
}

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
