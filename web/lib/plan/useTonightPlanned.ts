"use client";

import { useEffect, useState } from "react";

import { toPlanDate } from "@shared/lib/mealPlan/week";
import { fetchMealPlan } from "@shared/lib/supabase/mealPlan";
import { fetchRecipeById } from "@shared/lib/supabase/recipes";
import type { Recipe } from "@shared/types/recipe";

import { useAuth } from "@/components/AuthProvider";

/**
 * Tonight's dinner from the meal plan (PIN-77): the recipe planned for today's dinner, not yet cooked and not
 * leftovers. Null when nothing is planned, so the Library falls back to Tonight's pick.
 */
export function useTonightPlanned(loaded: Recipe[]): Recipe | null {
  const { user } = useAuth();
  const userId = user?.id;
  const [found, setFound] = useState<{ userId: string; recipeId: string | null } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const today = toPlanDate(new Date());
    fetchMealPlan(today, today)
      .then((rows) => rows.find((row) => row.meal === "dinner" && !row.leftoverOf && !row.cookedAt)?.recipeId ?? null)
      .catch(() => null)
      .then((recipeId) => {
        if (!cancelled) setFound({ userId, recipeId });
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const plannedId = found && found.userId === userId ? found.recipeId : null;
  const inList = plannedId ? loaded.find((recipe) => recipe.id === plannedId) ?? null : null;
  // A recipe past the Library's first page isn't loaded yet: read it on its own.
  const [fetched, setFetched] = useState<Recipe | null>(null);
  const missing = plannedId != null && inList == null && fetched?.id !== plannedId;
  useEffect(() => {
    if (!missing || !plannedId) return;
    let active = true;
    fetchRecipeById(plannedId)
      .then((recipe) => {
        if (active && recipe) setFetched(recipe);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [missing, plannedId]);

  return inList ?? (fetched && fetched.id === plannedId ? fetched : null);
}
