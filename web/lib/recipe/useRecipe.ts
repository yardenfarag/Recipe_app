"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { RecipeLanguageCode } from "@shared/lib/recipeLanguages";
import { fetchRecipeTranslation } from "@shared/lib/supabase/recipeTranslations";
import { resolveRecipeSourceLanguage } from "@shared/lib/recipeSourceLanguage";
import { fetchRecipeById, setRecipeFavorite } from "@shared/lib/supabase/recipes";
import { showToast } from "@shared/lib/toast";
import type { Recipe, RecipeTranslationContent } from "@shared/types/recipe";

import { useAuth } from "@/components/AuthProvider";
import { useLanguage } from "@/components/LanguageProvider";
import type { RecipeDisplay } from "@/components/recipe/types";
import { patchLibrary } from "@/lib/library/libraryCache";
import { buildRecipeDisplay, needsTranslation } from "@/lib/recipe/recipeDisplay";

/**
 * Which language the page shows. `auto` follows the app's language (a saved translation into it, else the recipe's
 * own); `source` is the recipe's own words; a language is one picked with Translate, with its content.
 */
export type RecipeView =
  | { kind: "auto" }
  | { kind: "source" }
  | { kind: "language"; language: RecipeLanguageCode; translation: RecipeTranslationContent };

export type ReadyRecipe = {
  status: "ready";
  display: RecipeDisplay;
  toggleFavorite: () => void;
  reload: () => void;
  /**
   * Puts a newer copy of the row on the page (after an action saved it). `textChanged` drops the saved translation
   * on the page as well, since saving new words deletes the stored ones (ADR 012), and goes back to `auto`.
   */
  replaceRecipe: (next: Recipe | ((current: Recipe) => Recipe), options?: { textChanged?: boolean }) => void;
  /** Shows the recipe in another language for this visit (Translate), or its own words (`source`). */
  setView: (view: RecipeView) => void;
  view: RecipeView;
};

export type RecipeState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "error"; reload: () => void }
  | ReadyRecipe;

type Loaded =
  /** `language`: the app language the translation was looked up for. */
  | { id: string; kind: "ready"; recipe: Recipe; language: string; translation: RecipeTranslationContent | null }
  | { id: string; kind: "missing" }
  | { id: string; kind: "error" };

/** A saved translation into `language`, if there is one. Never translates by itself: the reader asks (Translate). */
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
  /** Kept with the recipe id and app language it was chosen under, so it never carries to another recipe. */
  const [chosenView, setChosenView] = useState<{ id: string; language: string; view: RecipeView } | null>(null);
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
  const view: RecipeView = chosenView && chosenView.id === id && chosenView.language === language ? chosenView.view : AUTO;
  const display = useMemo(() => {
    if (!recipe) return null;
    if (view.kind === "source") return buildRecipeDisplay(recipe, resolveRecipeSourceLanguage(recipe), null, builtFor);
    if (view.kind === "language") return buildRecipeDisplay(recipe, view.language, view.translation, builtFor);
    return buildRecipeDisplay(recipe, builtFor, translation);
  }, [recipe, builtFor, translation, view]);

  const setView = useCallback((next: RecipeView) => setChosenView({ id, language, view: next }), [id, language]);

  const replaceRecipe = useCallback(
    (next: Recipe | ((current: Recipe) => Recipe), options?: { textChanged?: boolean }) => {
      setLoaded((previous) => {
        if (previous?.kind !== "ready") return previous;
        const recipe = typeof next === "function" ? next(previous.recipe) : next;
        if (recipe.id !== previous.recipe.id) return previous;
        return {
          ...previous,
          recipe: { ...recipe, is_favorite: recipe.is_favorite === true },
          translation: options?.textChanged ? null : previous.translation,
        };
      });
      if (options?.textChanged) setChosenView(null);
    },
    [],
  );

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
    // The Library shows it straight away when you go back (it keeps its recipes in memory, PIN-174).
    patchLibrary(recipe.id, { is_favorite: next });
    setRecipeFavorite(recipe.id, next).catch(() => {
      setFavorite(recipe.id, !next);
      patchLibrary(recipe.id, { is_favorite: !next });
      showToast(t("recipe.favoriteFailedTitle"), "info");
    });
  }, [recipe, setFavorite, t]);

  if (!current) return { status: "loading" };
  if (current.kind === "missing") return { status: "missing" };
  if (current.kind === "error" || !display) return { status: "error", reload: retry };
  return { status: "ready", display, toggleFavorite, reload, replaceRecipe, setView, view };
}

const AUTO: RecipeView = { kind: "auto" };
