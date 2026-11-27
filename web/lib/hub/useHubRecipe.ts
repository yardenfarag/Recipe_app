"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { recipeCardToListRecipe } from "@shared/lib/recipeCardMap";
import { resolveRecipeSourceLanguage } from "@shared/lib/recipeSourceLanguage";
import { claimHubCard, fetchHubCard, fetchLibraryRecipeForCard } from "@shared/lib/supabase/cookingHub";
import { fetchRecipeCardTranslation } from "@shared/lib/supabase/recipeCardTranslations";
import type { RecipeTranslationContent } from "@shared/types/recipe";
import type { RecipeCard } from "@shared/types/recipeCard";

import { useAuth } from "@/components/AuthProvider";
import { useLanguage } from "@/components/LanguageProvider";
import type { RecipeDisplay } from "@/components/recipe/types";
import { buildRecipeDisplay } from "@/lib/recipe/recipeDisplay";

export type HubRecipeState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "error"; reload: () => void }
  | {
      status: "ready";
      card: RecipeCard;
      display: RecipeDisplay;
      /** The recipe in the cook's library made from this card, if they already added it. */
      libraryRecipeId: string | null;
      /** Copies the card into the library (free, no credit) and gives the new recipe's id. */
      addToLibrary: () => Promise<string>;
      /** Shows the card as written ("Show original"), or back in the app language; null when it has no translation. */
      setShowOriginal: ((original: boolean) => void) | null;
      showingOriginal: boolean;
    };

type Loaded =
  | {
      key: string;
      kind: "ready";
      card: RecipeCard;
      libraryRecipeId: string | null;
      /** The card's translation into `language` (the app's when it loaded), if the server has made one. */
      translation: RecipeTranslationContent | null;
      language: string;
    }
  | { key: string; kind: "missing" }
  | { key: string; kind: "error" };

/** A card's translation into `language`, if one is saved. A failed read shows the card as written. */
async function cardTranslation(card: RecipeCard, language: string): Promise<RecipeTranslationContent | null> {
  if (resolveRecipeSourceLanguage(card) === language) return null;
  return fetchRecipeCardTranslation(card.id, language).catch(() => null);
}

/**
 * One Hub recipe, by its id or by the slug of its public page (pinch-app.io/r/<slug>), and whether the cook already
 * has it in their library. A card written in another language is shown in the app's when the server has translated
 * it (recipe_card_translations, PIN-77); otherwise as written. A card is never translated from here: it isn't the
 * cook's recipe until they add it.
 */
export function useHubRecipe(idOrSlug: string): HubRecipeState {
  const { user } = useAuth();
  const { language } = useLanguage();
  const userId = user?.id;
  const key = (idOrSlug ?? "").trim();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  /** "Show original", kept with the card and language it was chosen for. */
  const [original, setOriginal] = useState<{ key: string; language: string } | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestId.current;
    let next: Loaded;
    if (!key) {
      next = { key, kind: "missing" };
    } else {
      try {
        const card = await fetchHubCard(key);
        if (!card) {
          next = { key, kind: "missing" };
        } else {
          const [libraryRecipeId, translation] = await Promise.all([
            // If this check fails, offering "Add to library" is safe: adding twice returns the recipe already there.
            userId ? fetchLibraryRecipeForCard(card.id).catch(() => null) : Promise.resolve(null),
            cardTranslation(card, language),
          ]);
          next = { key, kind: "ready", card, libraryRecipeId, translation, language };
        }
      } catch {
        next = { key, kind: "error" };
      }
    }
    if (requestId.current === request) setLoaded(next);
  }, [key, language, userId]);

  useEffect(() => {
    // Loads from the network, so state is set after the response.
    void load();
  }, [load]);

  const retry = useCallback(() => {
    setLoaded(null);
    void load();
  }, [load]);

  const current = loaded?.key === key ? loaded : null;
  const card = current?.kind === "ready" ? current.card : null;
  // Until the translation for a new app language is read, the page keeps showing what it was built for.
  const builtFor = current?.kind === "ready" ? current.language : language;
  const translation = current?.kind === "ready" ? current.translation : null;
  const showingOriginal = translation != null && original?.key === key && original.language === builtFor;
  const display = useMemo(() => {
    if (!card) return null;
    const recipe = recipeCardToListRecipe(card);
    return showingOriginal
      ? buildRecipeDisplay(recipe, resolveRecipeSourceLanguage(recipe), null, builtFor)
      : buildRecipeDisplay(recipe, builtFor, translation);
  }, [builtFor, card, showingOriginal, translation]);
  const setShowOriginal = useCallback(
    (next: boolean) => setOriginal(next ? { key, language: builtFor } : null),
    [builtFor, key],
  );

  const addToLibrary = useCallback(async () => {
    if (!card) throw new Error("card_not_found");
    const recipeId = await claimHubCard(card.id);
    setLoaded((previous) => (previous?.kind === "ready" && previous.card.id === card.id ? { ...previous, libraryRecipeId: recipeId } : previous));
    return recipeId;
  }, [card]);

  if (!current) return { status: "loading" };
  if (current.kind === "missing") return { status: "missing" };
  if (current.kind === "error" || !display || !card) return { status: "error", reload: retry };
  return {
    status: "ready",
    card,
    display,
    libraryRecipeId: current.libraryRecipeId,
    addToLibrary,
    setShowOriginal: translation ? setShowOriginal : null,
    showingOriginal,
  };
}
