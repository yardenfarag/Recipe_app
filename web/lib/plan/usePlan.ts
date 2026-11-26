"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { hubAvoidOf } from "@shared/lib/hubAvoid";
import type { KitchenProfile } from "@shared/lib/kitchenProfile";
import {
  candidateFromCard,
  candidateFromRecipe,
  fillWeek,
  libraryOnlyStatus,
  mealKindOf,
  type LibraryOnlyStatus,
  type PlanCandidate,
  type PlanReason,
} from "@shared/lib/mealPlan/fillWeek";
import { cleanMealPlanPrefs, mealsOfDay, weekendFor, type PlanWeek } from "@shared/lib/mealPlan/week";
import { claimHubCard, fetchHubCards } from "@shared/lib/supabase/cookingHub";
import { fetchCloudKitchenProfile } from "@shared/lib/supabase/kitchen";
import {
  deleteMealPlanEntries,
  fetchMealPlan,
  fetchMealPlanPrefs,
  saveMealPlanMeals,
  saveMealPlanPrefs,
  updateMealPlanEntry,
} from "@shared/lib/supabase/mealPlan";
import type { MealKind, MealPlanEntry, MealPlanPrefs, PlanAdjust, PlanMeal } from "@shared/types/mealPlan";
import type { Recipe } from "@shared/types/recipe";
import type { RecipeCard } from "@shared/types/recipeCard";

import { useAuth } from "@/components/AuthProvider";
import { useLanguage } from "@/components/LanguageProvider";
import { useRecipes } from "@/lib/library/useRecipes";
import { usePantryStaples } from "@/lib/list/usePantryStaples";
import { hubCardsNotInLibrary, mealsToSave, plannedMeals, slotKey, slotsToFill } from "@/lib/plan/planModel";

/** Hub cards to choose from when filling: the best-fitting ones for the cook's diets and allergies. */
const HUB_POOL = 240;

export type FillRequest = {
  days: string[];
  meals: PlanMeal[];
  mode: "fill" | "reshuffle";
  useHub: boolean;
  leftovers: boolean;
  adjust: PlanAdjust;
};

export type FillOutcome = { filled: number; empty: number };

/**
 * One week of the signed-in cook's plan, and everything filling it needs: their recipes, their kitchen profile
 * (diets, allergies, servings), what is at home, and Hub cards when the Library is short. Filling runs in the
 * browser (shared/lib/mealPlan/fillWeek) and only the result is saved. Hub recipes are saved to the Library first.
 */
export function usePlan(week: PlanWeek) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { language } = useLanguage();
  const { recipes, loading: recipesLoading, hasMore, ensureAllLoaded, refresh: refreshRecipes } = useRecipes(40);
  const { staples } = usePantryStaples();
  const [entries, setEntries] = useState<MealPlanEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [profile, setProfile] = useState<KitchenProfile | null>(null);
  const [prefs, setPrefs] = useState<MealPlanPrefs>(() => cleanMealPlanPrefs(null));
  /** Reasons from the last fill, by meal, for this visit only (they aren't saved). */
  const [reasons, setReasons] = useState<Record<string, PlanReason>>({});
  const hubPool = useRef<RecipeCard[] | null>(null);
  const first = week.days[0];
  const last = week.days[6];

  // Filling needs the whole Library, not the first page.
  useEffect(() => {
    if (hasMore) void ensureAllLoaded();
  }, [ensureAllLoaded, hasMore]);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const rows = await fetchMealPlan(first, last);
      setEntries(rows);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [first, last, userId]);

  useEffect(() => {
    // Reading the week when it opens, or when the cook moves to another week, is what this effect is for.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEntries(null);
    void load();
  }, [load]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void Promise.all([fetchCloudKitchenProfile(userId).catch(() => null), fetchMealPlanPrefs(userId).catch(() => null)]).then(
      ([kitchen, saved]) => {
        if (cancelled) return;
        if (kitchen) setProfile(kitchen);
        if (saved) setPrefs(saved);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const recipesById = useMemo(() => new Map(recipes.map((recipe) => [recipe.id, recipe])), [recipes]);
  const homeNames = useMemo(() => staples ?? [], [staples]);
  const avoid = useMemo(
    () => ({ allergies: profile?.allergies ?? [], otherAllergies: profile?.otherAllergies ?? [], dislikes: profile?.dislikes ?? [] }),
    [profile],
  );
  const diets = useMemo(() => profile?.diets ?? [], [profile]);
  const library = useMemo(() => recipes.map(candidateFromRecipe), [recipes]);

  const libraryStatus = useCallback(
    (meals: PlanMeal[]): LibraryOnlyStatus => libraryOnlyStatus(library, avoid, diets, [...new Set(meals.map(mealKindOf))] as MealKind[]),
    [avoid, diets, library],
  );

  const hubCandidates = useCallback(async (): Promise<PlanCandidate[]> => {
    if (!hubPool.current) {
      const { cards } = await fetchHubCards({ diets, avoid: hubAvoidOf(avoid), sort: "popular", limit: HUB_POOL, includeCount: false });
      hubPool.current = cards;
    }
    return hubCardsNotInLibrary(hubPool.current, recipes).map(candidateFromCard);
  }, [avoid, diets, recipes]);

  const savePrefs = useCallback(
    async (next: MealPlanPrefs) => {
      setPrefs(next);
      if (userId) await saveMealPlanPrefs(userId, next).catch(() => undefined);
    },
    [userId],
  );

  /** Fills (or reshuffles) the chosen days and meals, saves the result and reads the week again. */
  const fill = useCallback(
    async (request: FillRequest, onlySlot?: { date: string; meal: PlanMeal }, exclude: string[] = []): Promise<FillOutcome> => {
      if (!userId || !entries) return { filled: 0, empty: 0 };
      const status = libraryStatus(request.meals);
      const useHub = request.useHub || !status.allowed;
      const hubFor = status.thinMeals;
      const needsHub = useHub || hubFor.length > 0;
      const candidates = [...library, ...(needsHub ? await hubCandidates() : [])].filter((candidate) => !exclude.includes(candidate.id));

      const { slots, replace } = onlySlot
        ? slotsToFill(entries, [onlySlot.date], [onlySlot.meal], "reshuffle")
        : slotsToFill(entries, request.days, request.meals, request.mode);
      if (slots.length === 0) return { filled: 0, empty: 0 };

      const result = fillWeek({
        slots,
        planned: plannedMeals(entries, replace),
        candidates,
        avoid,
        diets,
        homeNames,
        now: new Date(),
        weekend: weekendFor(language),
        useHub,
        hubFor,
        leftovers: request.leftovers,
        adjust: request.adjust,
        seed: `${Date.now()}`,
      });

      // Hub cards become the cook's own recipes before they go into the plan.
      const cardIds = [...new Set(result.filled.map((meal) => meal.candidateId).filter((id) => !recipesById.has(id)))];
      const claimed = new Map<string, string>();
      await Promise.all(
        cardIds.map(async (cardId) => {
          try {
            claimed.set(cardId, await claimHubCard(cardId));
          } catch {
            // A card that can't be saved leaves its meal empty.
          }
        }),
      );
      const recipeIdFor = (id: string) => (recipesById.has(id) ? id : claimed.get(id) ?? null);

      await deleteMealPlanEntries(replace.map((entry) => entry.id));
      const servings = profile?.defaultServings ?? 2;
      await saveMealPlanMeals(userId, mealsToSave(result.filled, recipeIdFor, servings));
      setReasons((previous) => {
        const next = { ...previous };
        for (const meal of result.filled) next[slotKey(meal.date, meal.meal)] = meal.reason;
        return next;
      });
      if (claimed.size > 0) void refreshRecipes();
      await load();
      return { filled: result.filled.length, empty: result.empty.length };
    },
    [avoid, diets, entries, homeNames, hubCandidates, language, library, libraryStatus, load, profile, recipesById, refreshRecipes, userId],
  );

  /** Another recipe for one meal. Its leftovers go with it. */
  const shuffle = useCallback(
    (entry: MealPlanEntry) =>
      fill(
        {
          days: [entry.date],
          meals: [entry.meal],
          mode: "reshuffle",
          useHub: prefs.useHub,
          leftovers: false,
          adjust: {},
        },
        { date: entry.date, meal: entry.meal },
        // Another recipe: never the one being replaced.
        [entry.recipeId],
      ),
    [fill, prefs.useHub],
  );

  const change = useCallback(
    async (entry: MealPlanEntry, patch: { locked?: boolean; cookedAt?: string | null; servings?: number }) => {
      setEntries((current) => current?.map((row) => (row.id === entry.id ? { ...row, ...patch } : row)) ?? current);
      try {
        await updateMealPlanEntry(entry.id, patch);
      } catch (caught) {
        await load();
        throw caught;
      }
    },
    [load],
  );

  const remove = useCallback(
    async (entry: MealPlanEntry) => {
      setEntries((current) => current?.filter((row) => row.id !== entry.id && row.leftoverOf !== entry.id) ?? current);
      try {
        await deleteMealPlanEntries([entry.id]);
      } catch (caught) {
        await load();
        throw caught;
      }
    },
    [load],
  );

  const recipeFor = useCallback((entry: MealPlanEntry): Recipe | null => recipesById.get(entry.recipeId) ?? null, [recipesById]);

  return {
    entries,
    loading: entries == null && !failed,
    failed,
    reload: load,
    recipesLoading,
    recipeFor,
    recipes,
    profile,
    homeNames,
    prefs,
    savePrefs,
    reasons,
    libraryStatus,
    fill,
    shuffle,
    change,
    remove,
    mealsOfDay: (p: MealPlanPrefs = prefs) => mealsOfDay(p.meals, p.snacksPerDay),
  };
}
