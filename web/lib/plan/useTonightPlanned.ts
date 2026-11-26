"use client";

import { useEffect, useState } from "react";

import { toPlanDate } from "@shared/lib/mealPlan/week";
import { fetchMealPlan } from "@shared/lib/supabase/mealPlan";

import { useAuth } from "@/components/AuthProvider";

/**
 * Tonight's dinner from the meal plan (PIN-77): the recipe planned for today's dinner, not yet cooked and not
 * leftovers. Null when nothing is planned, so the Library falls back to Tonight's pick.
 */
export function useTonightPlanned(): string | null {
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

  return found && found.userId === userId ? found.recipeId : null;
}
