import {
  fetchRecipeByUrl,
  saveRecipe,
  type NewRecipe,
} from '@/lib/supabase/recipes';
import type { Recipe } from '@/types/recipe';

export type DraftSaveResult = {
  recipe: Recipe;
  recoveredDuplicate: boolean;
};

/**
 * If the insert committed before the app received its response, resolve the
 * unique-URL conflict to the committed row instead of trapping the draft.
 */
export async function saveRecipeDraft(recipe: NewRecipe): Promise<DraftSaveResult> {
  try {
    return { recipe: await saveRecipe(recipe), recoveredDuplicate: false };
  } catch (error) {
    if (!isUniqueViolation(error) || !recipe.original_url?.trim()) throw error;
    const existing = await fetchRecipeByUrl(recipe.original_url);
    if (!existing) throw error;
    return { recipe: existing, recoveredDuplicate: true };
  }
}

function isUniqueViolation(error: unknown): error is { code: string } {
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}
