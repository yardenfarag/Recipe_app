import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { useLanguagePreference } from '@/hooks/useLanguagePreference';
import { effectiveSourceLanguage } from '@/lib/appLanguages';
import { backfillRecipeThumbnails } from '@/lib/backfillRecipeThumbnails';
import { getGuestRecipes } from '@/lib/guestRecipes';
import { withDisplayTitles } from '@/lib/recipeDisplayTitle';
import { normalizeRecipeFavorite, normalizeRecipes, toggleRecipeFavorite } from '@/lib/recipeFavorites';
import { fetchRecipeTranslationsForLanguage } from '@/lib/supabase/recipeTranslations';
import { fetchRecipes } from '@/lib/supabase/recipes';
import { Recipe } from '@/types/recipe';

/**
 * Loads the current user's recipes — guest (AsyncStorage) or Supabase,
 * depending on auth state — and refreshes whenever the screen regains
 * focus (e.g. after saving a recipe or signing in/out).
 *
 * Waits for guest→cloud migration to finish so the library does not flash empty.
 */
export function useRecipes() {
  const { user, migrationStatus } = useAuth();
  const { language: preferredLanguage } = useLanguagePreference();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const data = user ? await fetchRecipes() : await getGuestRecipes();
      const backfilled = await backfillRecipeThumbnails(normalizeRecipes(data));

      let withTranslations = backfilled;
      if (user) {
        const needingTitle = backfilled.filter(
          (r) => effectiveSourceLanguage(r.source_language) !== preferredLanguage,
        );
        if (needingTitle.length > 0) {
          const map = await fetchRecipeTranslationsForLanguage(
            preferredLanguage,
            needingTitle.map((r) => r.id),
          );
          withTranslations = backfilled.map((recipe) => {
            const cached = map[recipe.id];
            if (!cached) return recipe;
            return {
              ...recipe,
              translations: {
                ...(recipe.translations ?? {}),
                [preferredLanguage]: cached,
              },
            };
          });
        }
      }

      setRecipes(withDisplayTitles(withTranslations, preferredLanguage));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your recipes.');
    } finally {
      setLoading(false);
    }
  }, [user, preferredLanguage]);

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
      if (user && migrationStatus === 'running') {
        setLoading(true);
        return;
      }
      refresh();
    }, [refresh, user, migrationStatus]),
  );

  useEffect(() => {
    if (!user) return;
    if (migrationStatus === 'done' || migrationStatus === 'error') {
      void refresh();
    }
  }, [user, migrationStatus, refresh]);

  return { recipes, loading, error, refresh, patchRecipe, toggleFavorite };
}
