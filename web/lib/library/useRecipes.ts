"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { withDisplayTitles } from "@shared/lib/recipeDisplayTitle";
import { resolveRecipeSourceLanguage } from "@shared/lib/recipeSourceLanguage";
import { fetchRecipeTranslationsForLanguage } from "@shared/lib/supabase/recipeTranslations";
import { fetchRecipes, fetchRecipesPage, setRecipeFavorite } from "@shared/lib/supabase/recipes";
import type { Recipe } from "@shared/types/recipe";

import { useAuth } from "@/components/AuthProvider";
import { useLanguage } from "@/components/LanguageProvider";
import { libraryKey, readLibrary, writeLibrary } from "@/lib/library/libraryCache";

/** The database leaves is_favorite empty for recipes never favorited. The screen wants a plain true or false. */
const normalize = (recipe: Recipe): Recipe => ({ ...recipe, is_favorite: recipe.is_favorite === true });

/**
 * The signed-in person's recipes, loaded a page at a time as they scroll (the same pages of 40 as the mobile app),
 * with titles shown in the app's language. `ensureAllLoaded` fetches the rest when a search or filter needs the
 * whole library to be right.
 *
 * Coming back to a screen that uses it shows the recipes from last time at once (lib/library/libraryCache.ts), then
 * refreshes them quietly: as many as were showing, so the list doesn't shrink or jump under the reader (PIN-174).
 */
export function useRecipes(pageSize = 40) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const userId = user?.id;
  const key = userId ? libraryKey(userId, language, pageSize) : null;
  // What this screen showed last time, if anything: read once, when it opens.
  const [remembered] = useState(() => (key ? readLibrary(key) : null));
  const [recipes, setRecipes] = useState<Recipe[]>(() => remembered?.recipes ?? []);
  const [loading, setLoading] = useState(!remembered);
  const [loadingMore, setLoadingMore] = useState(false);
  const [total, setTotal] = useState(remembered?.total ?? 0);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const nextOffset = useRef(remembered?.loaded ?? 0);
  /** Every recipe is loaded (a search or filter asked for them all): a refresh brings them all back. */
  const allLoaded = useRef(remembered != null && remembered.loaded >= remembered.total && remembered.total > pageSize);
  const refreshing = useRef(false);
  /** Whose recipes, in which language, `recipes` holds: they are kept under that key. */
  const recipesKey = useRef(remembered ? key : null);

  const hasMore = recipes.length < total;

  const decorate = useCallback(
    async (rows: Recipe[]) => {
      const normalized = rows.map(normalize);
      const needingTitle = normalized.filter((recipe) => resolveRecipeSourceLanguage(recipe) !== language);
      let withTranslations = normalized;
      if (needingTitle.length > 0) {
        const cached = await fetchRecipeTranslationsForLanguage(
          language,
          needingTitle.map((recipe) => recipe.id),
        );
        withTranslations = normalized.map((recipe) =>
          cached[recipe.id]
            ? { ...recipe, translations: { ...(recipe.translations ?? {}), [language]: cached[recipe.id] } }
            : recipe,
        );
      }
      return withDisplayTitles(withTranslations, language);
    },
    [language],
  );

  const commit = useCallback((rows: Recipe[], loadedCount: number, nextTotal: number, replace: boolean) => {
    setRecipes((previous) => {
      if (replace) return rows;
      const seen = new Set(previous.map((recipe) => recipe.id));
      return [...previous, ...rows.filter((recipe) => !seen.has(recipe.id))];
    });
    nextOffset.current = loadedCount;
    setTotal(nextTotal);
  }, []);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const id = ++requestId.current;
    const requestKey = key;
    refreshing.current = true;
    setError(null);
    try {
      let rows: Recipe[];
      let loadedCount: number;
      let nextTotal: number;
      if (allLoaded.current) {
        const all = await fetchRecipes();
        rows = await decorate(all);
        loadedCount = nextTotal = all.length;
      } else {
        // At least a page, and as many as are already showing.
        const page = await fetchRecipesPage(0, Math.max(pageSize, nextOffset.current));
        rows = await decorate(page.recipes);
        loadedCount = page.recipes.length;
        nextTotal = page.total;
      }
      if (requestId.current !== id) return;
      recipesKey.current = requestKey;
      commit(rows, loadedCount, nextTotal, true);
    } catch (caught) {
      if (requestId.current !== id) return;
      setError(caught instanceof Error ? caught.message : "load failed");
    } finally {
      if (requestId.current === id) {
        refreshing.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [commit, decorate, key, pageSize, userId]);

  const loadMore = useCallback(async () => {
    // A quiet refresh is replacing the list; the next page waits for it (the list's end is looked for again then).
    if (!userId || loading || loadingMore || !hasMore || refreshing.current) return;
    const id = ++requestId.current;
    const offset = nextOffset.current;
    setLoadingMore(true);
    try {
      const page = await fetchRecipesPage(offset, pageSize);
      const rows = await decorate(page.recipes);
      if (requestId.current !== id) return;
      commit(rows, offset + page.recipes.length, page.total, false);
    } catch (caught) {
      if (requestId.current !== id) return;
      setError(caught instanceof Error ? caught.message : "load failed");
    } finally {
      if (requestId.current === id) setLoadingMore(false);
    }
  }, [commit, decorate, hasMore, loading, loadingMore, pageSize, userId]);

  const ensureAllLoaded = useCallback(async () => {
    if (!userId || !hasMore) return;
    const id = ++requestId.current;
    const requestKey = key;
    setLoadingMore(true);
    try {
      const rows = await decorate(await fetchRecipes());
      if (requestId.current !== id) return;
      allLoaded.current = true;
      recipesKey.current = requestKey;
      commit(rows, rows.length, rows.length, true);
    } catch (caught) {
      if (requestId.current !== id) return;
      setError(caught instanceof Error ? caught.message : "load failed");
    } finally {
      if (requestId.current === id) {
        refreshing.current = false;
        setLoadingMore(false);
      }
    }
  }, [commit, decorate, hasMore, key, userId]);

  useEffect(() => {
    // Loads from the network, so state is set after the response. Runs again when the app's language changes.
    // With recipes from last time on screen, this is the quiet refresh.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  // Kept for next time, with every change: a page loaded, a heart, a rename.
  useEffect(() => {
    if (recipesKey.current) writeLibrary({ key: recipesKey.current, recipes, total, loaded: nextOffset.current });
  }, [recipes, total]);

  const patchRecipe = useCallback((id: string, patch: Partial<Recipe>) => {
    setRecipes((previous) => previous.map((recipe) => (recipe.id === id ? normalize({ ...recipe, ...patch }) : recipe)));
  }, []);

  /** Updates the heart at once and puts it back if saving fails. Throws so the screen can say so. */
  const toggleFavorite = useCallback(
    async (recipe: Recipe) => {
      const previous = recipe.is_favorite === true;
      patchRecipe(recipe.id, { is_favorite: !previous });
      try {
        await setRecipeFavorite(recipe.id, !previous);
      } catch (caught) {
        patchRecipe(recipe.id, { is_favorite: previous });
        throw caught;
      }
    },
    [patchRecipe],
  );

  return { recipes, loading, loadingMore, hasMore, total, error, refresh, loadMore, ensureAllLoaded, patchRecipe, toggleFavorite };
}
