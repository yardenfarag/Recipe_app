import { setGuestRecipeFavorite } from '@/lib/guestRecipes';
import { setRecipeFavorite } from '@/lib/supabase/recipes';
import { Recipe } from '@/types/recipe';

/** Coerce DB null/undefined to a strict boolean for favorite UI. */
export function normalizeRecipeFavorite(recipe: Recipe): Recipe {
  return { ...recipe, is_favorite: recipe.is_favorite === true };
}

export function normalizeRecipes(recipes: Recipe[]): Recipe[] {
  return recipes.map(normalizeRecipeFavorite);
}

/** Toggles favorite and returns the new value. */
export async function toggleRecipeFavorite(
  recipe: Recipe,
  isFavorite: boolean,
): Promise<boolean> {
  if (recipe.id.startsWith('guest-')) {
    await setGuestRecipeFavorite(recipe.id, isFavorite);
  } else {
    await setRecipeFavorite(recipe.id, isFavorite);
  }

  return isFavorite;
}
