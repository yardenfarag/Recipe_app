"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { recipeCardToListRecipe } from "@shared/lib/recipeCardMap";
import { claimHubCard, fetchHubCard, fetchLibraryRecipeForCard } from "@shared/lib/supabase/cookingHub";
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
    };

type Loaded =
  | { key: string; kind: "ready"; card: RecipeCard; libraryRecipeId: string | null }
  | { key: string; kind: "missing" }
  | { key: string; kind: "error" };

/**
 * One Hub recipe, by its id or by the slug of its public page (pinch-app.io/r/<slug>), and whether the cook already
 * has it in their library. As on mobile, the card is shown in its own language: the Hub has no translations.
 */
export function useHubRecipe(idOrSlug: string): HubRecipeState {
  const { user } = useAuth();
  const { language } = useLanguage();
  const userId = user?.id;
  const key = (idOrSlug ?? "").trim();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
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
          let libraryRecipeId: string | null = null;
          if (userId) {
            // If this check fails, offering "Add to library" is safe: adding twice returns the recipe already there.
            libraryRecipeId = await fetchLibraryRecipeForCard(card.id).catch(() => null);
          }
          next = { key, kind: "ready", card, libraryRecipeId };
        }
      } catch {
        next = { key, kind: "error" };
      }
    }
    if (requestId.current === request) setLoaded(next);
  }, [key, userId]);

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
  const display = useMemo(() => (card ? buildRecipeDisplay(recipeCardToListRecipe(card), language, null) : null), [card, language]);

  const addToLibrary = useCallback(async () => {
    if (!card) throw new Error("card_not_found");
    const recipeId = await claimHubCard(card.id);
    setLoaded((previous) => (previous?.kind === "ready" && previous.card.id === card.id ? { ...previous, libraryRecipeId: recipeId } : previous));
    return recipeId;
  }, [card]);

  if (!current) return { status: "loading" };
  if (current.kind === "missing") return { status: "missing" };
  if (current.kind === "error" || !display || !card) return { status: "error", reload: retry };
  return { status: "ready", card, display, libraryRecipeId: current.libraryRecipeId, addToLibrary };
}
