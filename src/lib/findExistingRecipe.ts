import { getGuestRecipes } from '@/lib/guestRecipes';
import { detectPlatform, recipeUrlsMatch } from '@/lib/platformUrls';
import { fetchRecipeByUrl } from '@/lib/supabase/recipes';
import { Recipe } from '@/types/recipe';

/** Guest-only duplicate check — authed users rely on the extract-recipe edge function. */
export async function findExistingGuestRecipe(url: string): Promise<Recipe | null> {
  const trimmed = url.trim();
  if (!trimmed) return null;

  const recipes = await getGuestRecipes();
  return (
    recipes.find(
      (recipe) =>
        recipe.original_url &&
        recipeUrlsMatch(trimmed, recipe.original_url, recipe.platform ?? detectPlatform(trimmed)),
    ) ?? null
  );
}

/** Targeted Supabase lookup by URL (YouTube video id) — avoids loading the full library. */
export async function findExistingRecipe(url: string): Promise<Recipe | null> {
  return fetchRecipeByUrl(url);
}
