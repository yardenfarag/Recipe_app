"use client";

import { useEffect, useState } from "react";

import { localizeRecipes } from "@shared/lib/localizeRecipes";
import { toPlanDate } from "@shared/lib/mealPlan/week";
import { withDisplayTitles } from "@shared/lib/recipeDisplayTitle";
import { fetchMealPlan } from "@shared/lib/supabase/mealPlan";
import { fetchRecipeById } from "@shared/lib/supabase/recipes";
import type { Recipe } from "@shared/types/recipe";

import { useAuth } from "@/components/AuthProvider";
import { useLanguage } from "@/components/LanguageProvider";

/**
 * Tonight's dinner from the meal plan (PIN-77): the recipe planned for today's dinner, not yet cooked and not
 * leftovers. Null when nothing is planned, so the Library falls back to Tonight's pick.
 */
export function useTonightPlanned(loaded: Recipe[]): Recipe | null {
  const { user } = useAuth();
  const userId = user?.id;
  const { language } = useLanguage();
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
  // A recipe past the Library's first page isn't loaded yet: read it on its own, in the app language like its card,
  // and again when the language changes (the old title stays until then, as on the cards).
  const [fetched, setFetched] = useState<{ recipe: Recipe; language: string } | null>(null);
  const missing =
    plannedId != null &&
    inList == null &&
    (!fetched || fetched.recipe.id !== plannedId || fetched.language !== language);
  useEffect(() => {
    if (!missing || !plannedId) return;
    let active = true;
    fetchRecipeById(plannedId)
      .then(async (recipe) => {
        if (!recipe) return;
        // No translation to read: its own title, as a card shows it.
        const [shown] = await localizeRecipes([recipe], language).catch(() => withDisplayTitles([recipe], language));
        if (active) setFetched({ recipe: shown, language });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [language, missing, plannedId]);

  return inList ?? (fetched && fetched.recipe.id === plannedId ? fetched.recipe : null);
}
