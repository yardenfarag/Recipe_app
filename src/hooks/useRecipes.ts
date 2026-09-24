import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { useLanguagePreference } from '@/hooks/useLanguagePreference';
import { backfillRecipeThumbnails } from '@/lib/backfillRecipeThumbnails';
import { getGuestRecipes } from '@/lib/guestRecipes';
import { withDisplayTitles } from '@/lib/recipeDisplayTitle';
import { resolveRecipeSourceLanguage } from '@/lib/recipeSourceLanguage';
import { normalizeRecipeFavorite, normalizeRecipes, toggleRecipeFavorite } from '@/lib/recipeFavorites';
import { fetchRecipeTranslationsForLanguage } from '@/lib/supabase/recipeTranslations';
import { fetchRecipes, fetchRecipesPage } from '@/lib/supabase/recipes';
import { Recipe } from '@/types/recipe';

type UseRecipesOptions = {
  /** When set, signed-in libraries load this many recipes per scroll page. */
  pageSize?: number;
};

/**
 * Loads the current user's recipes — guest (AsyncStorage) or Supabase,
 * depending on auth state — and refreshes whenever the screen regains
 * focus (e.g. after saving a recipe or signing in/out).
 *
 * Waits for guest→cloud migration to finish so the library does not flash empty.
 */
export function useRecipes(options?: UseRecipesOptions) {
  const pageSize = options?.pageSize;
  const { user, migrationStatus } = useAuth();
  const { language: preferredLanguage } = useLanguagePreference();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const nextOffsetRef = useRef(0);
  const requestIdRef = useRef(0);

  const decorate = useCallback(
    async (data: Recipe[]) => {
      const backfilled = await backfillRecipeThumbnails(normalizeRecipes(data));

      let withTranslations = backfilled;
      if (user) {
        const needingTitle = backfilled.filter(
          (recipe) => resolveRecipeSourceLanguage(recipe) !== preferredLanguage,
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

      return withDisplayTitles(withTranslations, preferredLanguage);
    },
    [preferredLanguage, user],
  );

  const commit = useCallback(
    (decorated: Recipe[], loadedCount: number, nextTotal: number, replace: boolean) => {
      setRecipes((prev) => {
        if (replace) return decorated;
        const seen = new Set(prev.map((recipe) => recipe.id));
        return [...prev, ...decorated.filter((recipe) => !seen.has(recipe.id))];
      });
      nextOffsetRef.current = loadedCount;
      setTotal(nextTotal);
      setHasMore(pageSize != null && loadedCount < nextTotal);
    },
    [pageSize],
  );

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setError(null);
    try {
      if (!user) {
        const data = await getGuestRecipes();
        const decorated = await decorate(data);
        if (requestIdRef.current !== requestId) return;
        commit(decorated, decorated.length, decorated.length, true);
        return;
      }

      if (pageSize == null) {
        const data = await fetchRecipes();
        const decorated = await decorate(data);
        if (requestIdRef.current !== requestId) return;
        commit(decorated, decorated.length, decorated.length, true);
        return;
      }

      const result = await fetchRecipesPage(0, pageSize);
      const decorated = await decorate(result.recipes);
      if (requestIdRef.current !== requestId) return;
      commit(decorated, result.recipes.length, result.total, true);
    } catch (err) {
      if (requestIdRef.current !== requestId) return;
      setError(err instanceof Error ? err.message : 'Could not load your recipes.');
    } finally {
      if (requestIdRef.current === requestId) setLoading(false);
    }
  }, [commit, decorate, pageSize, user]);

  const loadMore = useCallback(() => {
    if (!user || pageSize == null || loading || loadingMore || !hasMore) return;
    const requestId = ++requestIdRef.current;
    const offset = nextOffsetRef.current;
    setLoadingMore(true);
    void (async () => {
      try {
        const result = await fetchRecipesPage(offset, pageSize);
        const decorated = await decorate(result.recipes);
        if (requestIdRef.current !== requestId) return;
        commit(decorated, offset + result.recipes.length, result.total, false);
      } catch (err) {
        if (requestIdRef.current !== requestId) return;
        setError(err instanceof Error ? err.message : 'Could not load your recipes.');
      } finally {
        if (requestIdRef.current === requestId) setLoadingMore(false);
      }
    })();
  }, [commit, decorate, hasMore, loading, loadingMore, pageSize, user]);

  const ensureAllLoaded = useCallback(async () => {
    if (!user || pageSize == null || !hasMore) return;
    const requestId = ++requestIdRef.current;
    setLoadingMore(true);
    try {
      const data = await fetchRecipes();
      const decorated = await decorate(data);
      if (requestIdRef.current !== requestId) return;
      commit(decorated, decorated.length, decorated.length, true);
    } catch (err) {
      if (requestIdRef.current !== requestId) return;
      setError(err instanceof Error ? err.message : 'Could not load your recipes.');
    } finally {
      if (requestIdRef.current === requestId) setLoadingMore(false);
    }
  }, [commit, decorate, hasMore, pageSize, user]);

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

  return {
    recipes,
    loading,
    loadingMore,
    hasMore,
    total,
    error,
    refresh,
    loadMore,
    ensureAllLoaded,
    patchRecipe,
    toggleFavorite,
  };
}
