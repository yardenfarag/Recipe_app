import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { backfillRecipeThumbnails } from '@/lib/backfillRecipeThumbnails';
import { getGuestRecipes } from '@/lib/guestRecipes';
import { normalizeRecipeFavorite, normalizeRecipes, toggleRecipeFavorite } from '@/lib/recipeFavorites';
import { fetchRecipes } from '@/lib/supabase/recipes';
import { Recipe } from '@/types/recipe';

/**
 * Loads the current user's recipes — guest (AsyncStorage) or Supabase,
 * depending on auth state — and refreshes whenever the screen regains
 * focus (e.g. after saving a recipe or signing in/out).
 */
export function useRecipes() {
  const { user } = useAuth();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const data = user ? await fetchRecipes() : await getGuestRecipes();
      const backfilled = await backfillRecipeThumbnails(normalizeRecipes(data));
      setRecipes(backfilled);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your recipes.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  const patchRecipe = useCallback((id: string, patch: Partial<Recipe>) => {
    setRecipes((prev) =>
      prev.map((recipe) =>
        recipe.id === id ? normalizeRecipeFavorite({ ...recipe, ...patch }) : recipe,
      ),
    );
  }, []);

  const toggleFavorite = useCallback(
    async (recipe: Recipe) => {
      const previous = recipe.is_favorite === true;
      const next = !previous;

      patchRecipe(recipe.id, { is_favorite: next });

      try {
        await toggleRecipeFavorite(recipe, next);
      } catch (err) {
        patchRecipe(recipe.id, { is_favorite: previous });
        throw err;
      }
    },
    [patchRecipe],
  );

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return { recipes, loading, error, refresh, patchRecipe, toggleFavorite };
}
