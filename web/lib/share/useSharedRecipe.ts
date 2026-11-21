"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { recipeUrlOrigin } from "@shared/lib/recipeOrigin";
import { claimRecipeShare, getRecipeShare, type RecipeSharePreview } from "@shared/lib/supabase/recipeShare";
import { fetchRecipeByUrl } from "@shared/lib/supabase/recipes";
import type { Recipe } from "@shared/types/recipe";

import { useAuth } from "@/components/AuthProvider";
import { useLanguage } from "@/components/LanguageProvider";
import type { RecipeDisplay } from "@/components/recipe/types";
import { buildRecipeDisplay } from "@/lib/recipe/recipeDisplay";

export type SaveSharedResult = {
  recipeId: string;
  /** True when the cook already had it: the saved copy opens, nothing new is added. */
  alreadySaved: boolean;
};

/** Saving failed. `code` is the Edge Function's, e.g. `share_not_found` when the link stopped working meanwhile. */
export class ShareSaveError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ShareSaveError";
  }
}

export type SharedRecipeState =
  | { status: "loading" }
  /** The link is wrong, or the sender stopped sharing it. */
  | { status: "missing" }
  | { status: "error"; reload: () => void }
  | {
      status: "ready";
      display: RecipeDisplay;
      /** The recipe in the cook's library that this one already is, if any (same source link). */
      libraryRecipeId: string | null;
      /** Copies the shared recipe into the library, or gives the copy already there. */
      save: () => Promise<SaveSharedResult>;
    };

type Loaded =
  | { key: string; kind: "ready"; recipe: RecipeSharePreview; libraryRecipeId: string | null }
  | { key: string; kind: "missing" }
  | { key: string; kind: "error" };

/** The shared recipe as a page shows it: a stable made-up id, so servings are remembered per link. */
function asSharedRecipe(token: string, recipe: RecipeSharePreview): Recipe {
  return { ...recipe, id: `share-${token}`, source_language: recipe.source_language ?? "en" };
}

/**
 * A recipe someone shared (pinch-app.io/s/<token>), through the `recipe-share` Edge Function, as on mobile
 * (src/app/s/[token].tsx). Anyone may read it. For a signed-in cook it also finds the copy already in their library,
 * matched on the source link as saving would, so the page can open that instead of saving it twice.
 */
export function useSharedRecipe(token: string): SharedRecipeState {
  const { user } = useAuth();
  const { language } = useLanguage();
  const userId = user?.id;
  const key = (token ?? "").trim();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestId.current;
    let next: Loaded;
    if (!key) {
      next = { key, kind: "missing" };
    } else {
      try {
        const result = await getRecipeShare(key);
        if (result.status !== "ok") {
          next = result.code === "share_not_found" ? { key, kind: "missing" } : { key, kind: "error" };
        } else {
          let libraryRecipeId: string | null = null;
          const url = result.recipe.original_url?.trim();
          if (userId && url) {
            // If this check fails, offering Save is safe: the claim gives back the copy already there.
            const existing = await fetchRecipeByUrl(url, recipeUrlOrigin(result.recipe.extraction_source)).catch(() => null);
            libraryRecipeId = existing?.id ?? null;
          }
          next = { key, kind: "ready", recipe: result.recipe, libraryRecipeId };
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
  const recipe = current?.kind === "ready" ? current.recipe : null;
  const libraryRecipeId = current?.kind === "ready" ? current.libraryRecipeId : null;
  const display = useMemo(() => (recipe ? buildRecipeDisplay(asSharedRecipe(key, recipe), language, null) : null), [recipe, key, language]);

  const save = useCallback(async (): Promise<SaveSharedResult> => {
    // Already in the library: open that copy rather than adding another.
    if (libraryRecipeId) return { recipeId: libraryRecipeId, alreadySaved: true };
    const result = await claimRecipeShare(key);
    if (result.status !== "ok") throw new ShareSaveError(result.message, result.code);
    setLoaded((previous) => (previous?.kind === "ready" && previous.key === key ? { ...previous, libraryRecipeId: result.recipeId } : previous));
    return { recipeId: result.recipeId, alreadySaved: result.alreadyClaimed };
  }, [key, libraryRecipeId]);

  if (!current) return { status: "loading" };
  if (current.kind === "missing") return { status: "missing" };
  if (current.kind === "error" || !display) return { status: "error", reload: retry };
  return { status: "ready", display, libraryRecipeId, save };
}
