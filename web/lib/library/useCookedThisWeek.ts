"use client";

import { useEffect, useMemo, useState } from "react";

import { fetchRecipesCookedSince, type CookedRecipe } from "@shared/lib/supabase/recipes";
import { recipesCookedWithin } from "@shared/lib/tonightsPick";
import type { Recipe } from "@shared/types/recipe";

import { useAuth } from "@/components/AuthProvider";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * What was cooked in the last seven days, most recent first, for the Library's "Cooked this week" tile. Asked for
 * on its own, because the Library loads recipes a page at a time and an old favourite cooked yesterday may not be
 * loaded. The recipes that are loaded win where they differ (one just marked as cooked shows at once). `version`
 * is anything that changes when the library does (its total), so a deleted recipe drops out.
 */
export function useCookedThisWeek(recipes: Recipe[], version: number): CookedRecipe[] {
  const { user } = useAuth();
  const userId = user?.id;
  const [now] = useState(() => new Date());
  const [fetched, setFetched] = useState<CookedRecipe[]>([]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchRecipesCookedSince(new Date(now.getTime() - WEEK_MS).toISOString())
      .then((rows) => {
        if (!cancelled) setFetched(rows);
      })
      .catch(() => {
        // The tile falls back to the recipes already loaded.
      });
    return () => {
      cancelled = true;
    };
  }, [userId, now, version]);

  return useMemo(() => {
    const loadedIds = new Set(recipes.map((recipe) => recipe.id));
    const loaded: CookedRecipe[] = recipesCookedWithin(recipes, now).map((recipe) => ({
      id: recipe.id,
      title: recipe.display_title ?? recipe.title,
      image_url: recipe.image_url,
      last_cooked_at: recipe.last_cooked_at,
    }));
    const others = fetched.filter((recipe) => !loadedIds.has(recipe.id));
    return [...loaded, ...others].sort((a, b) => Date.parse(b.last_cooked_at ?? "") - Date.parse(a.last_cooked_at ?? ""));
  }, [recipes, fetched, now]);
}
