"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { fetchRecipeTranslation } from "@shared/lib/supabase/recipeTranslations";
import { fetchRecipeById, setRecipeFavorite } from "@shared/lib/supabase/recipes";
import { showToast } from "@shared/lib/toast";
import type { Recipe, RecipeTranslationContent } from "@shared/types/recipe";

import { useAuth } from "@/components/AuthProvider";
import { useLanguage } from "@/components/LanguageProvider";
import type { RecipeDisplay } from "@/components/recipe/types";
import { buildRecipeDisplay, needsTranslation } from "@/lib/recipe/recipeDisplay";

export type RecipeState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "error"; reload: () => void }
  | { status: "ready"; display: RecipeDisplay; toggleFavorite: () => void; reload: () => void };

type Loaded =
  /** `language`: the app language the translation was looked up for. */
  | { id: string; kind: "ready"; recipe: Recipe; language: string; translation: RecipeTranslationContent | null }
  | { id: string; kind: "missing" }
  | { id: string; kind: "error" };

/** A saved translation into `language`, if there is one. Never translates: that costs a credit (a later ticket). */
async function savedTranslation(recipe: Recipe, language: string): Promise<RecipeTranslationContent | null> {
  if (!needsTranslation(recipe, language)) return null;
  const onRow = recipe.translations?.[language];
  if (onRow) return onRow;
  try {
    return await fetchRecipeTranslation(recipe.id, language);
  } catch {
    // The recipe still reads fine in its own language.
    return null;
  }
}

/**
 * Loads a saved recipe by id, with a saved translation into the app language when it is written in another. When
 * the app language changes, the recipe stays on screen while the other translation loads.
 */
export function useRecipe(id: string): RecipeState {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { language } = useLanguage();
  const userId = user?.id;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    if (!userId) return;
    const request = ++requestId.current;
    let next: Loaded;
    try {
      const recipe = await fetchRecipeById(id);
      next = recipe
        ? {
            id,
            kind: "ready",
            recipe: { ...recipe, is_favorite: recipe.is_favorite === true },
            language,
            translation: await savedTranslation(recipe, language),
          }
        : { id, kind: "missing" };
    } catch {
      next = { id, kind: "error" };
    }
    if (requestId.current === request) setLoaded(next);
  }, [id, language, userId]);

  useEffect(() => {
    // Loads from the network, so state is set after the response. Runs again when the app's language changes.
    void load();
  }, [load]);

  const retry = useCallback(() => {
    setLoaded(null);
    void load();
  }, [load]);

  const reload = useCallback(() => void load(), [load]);

  const current = loaded?.id === id ? loaded : null;
  const recipe = current?.kind === "ready" ? current.recipe : null;
  // Until the lookup for a new app language returns, the page keeps showing what it was built for.
  const builtFor = current?.kind === "ready" ? current.language : language;
  const translation = current?.kind === "ready" ? current.translation : null;
  const display = useMemo(() => (recipe ? buildRecipeDisplay(recipe, builtFor, translation) : null), [recipe, builtFor, translation]);

  const setFavorite = useCallback((recipeId: string, isFavorite: boolean) => {
    setLoaded((previous) =>
      previous?.kind === "ready" && previous.recipe.id === recipeId
        ? { ...previous, recipe: { ...previous.recipe, is_favorite: isFavorite } }
        : previous,
    );
  }, []);

  /** Updates the heart at once and puts it back, with a toast, if saving fails. */
  const toggleFavorite = useCallback(() => {
    if (!recipe) return;
    const next = recipe.is_favorite !== true;
    setFavorite(recipe.id, next);
    setRecipeFavorite(recipe.id, next).catch(() => {
      setFavorite(recipe.id, !next);
      showToast(t("recipe.favoriteFailedTitle"), "info");
    });
  }, [recipe, setFavorite, t]);

  if (!current) return { status: "loading" };
  if (current.kind === "missing") return { status: "missing" };
  if (current.kind === "error" || !display) return { status: "error", reload: retry };
  return { status: "ready", display, toggleFavorite, reload };
}
