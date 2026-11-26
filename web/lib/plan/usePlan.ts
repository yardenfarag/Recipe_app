"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { hubAvoidOf } from "@shared/lib/hubAvoid";
import type { KitchenProfile } from "@shared/lib/kitchenProfile";
import type { LibraryOnlyStatus, PlanReason } from "@shared/lib/mealPlan/fillWeek";
import { fillAndSavePlan, libraryStatusFor, type FillOutcome, type FillRequest } from "@shared/lib/mealPlan/planner";
import { cleanMealPlanPrefs, mealsOfDay, weekendFor, type PlanWeek } from "@shared/lib/mealPlan/week";
import { fetchHubCards } from "@shared/lib/supabase/cookingHub";
import { fetchCloudKitchenProfile } from "@shared/lib/supabase/kitchen";
import { deleteMealPlanEntries, fetchMealPlan, fetchMealPlanPrefs, saveMealPlanPrefs, updateMealPlanEntry } from "@shared/lib/supabase/mealPlan";
import type { MealPlanEntry, MealPlanPrefs, PlanMeal } from "@shared/types/mealPlan";
import type { Recipe } from "@shared/types/recipe";
import type { RecipeCard } from "@shared/types/recipeCard";

import { useAuth } from "@/components/AuthProvider";
import { useLanguage } from "@/components/LanguageProvider";
import { useRecipes } from "@/lib/library/useRecipes";
import { usePantryStaples } from "@/lib/list/usePantryStaples";

/** Hub cards to choose from when filling: the best-fitting ones for the cook's diets and allergies. */
const HUB_POOL = 240;

export type { FillOutcome, FillRequest };

/**
 * One week of the signed-in cook's plan, and everything filling it needs: their recipes, their kitchen profile
 * (diets, allergies, servings), what is at home, and Hub cards when the Library is short. Filling runs in the
 * browser (shared/lib/mealPlan/fillWeek) and only the result is saved. Hub recipes are saved to the Library first.
 */
export function usePlan(week: PlanWeek) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { language } = useLanguage();
  const { recipes, loading: recipesLoading, hasMore, error: recipesError, ensureAllLoaded, refresh: refreshRecipes } = useRecipes(40);
  const { staples } = usePantryStaples();
  const [entries, setEntries] = useState<MealPlanEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [profile, setProfile] = useState<KitchenProfile | null>(null);
  const [prefs, setPrefs] = useState<MealPlanPrefs>(() => cleanMealPlanPrefs(null));
  /** Reasons from the last fill, by meal, for this visit only (they aren't saved). */
  const [reasons, setReasons] = useState<Record<string, PlanReason>>({});
  const hubPool = useRef<{ key: string; cards: RecipeCard[] } | null>(null);
  const first = week.days[0];
  const last = week.days[6];

  // Filling needs the whole Library, not the first page.
  useEffect(() => {
    if (hasMore) void ensureAllLoaded();
  }, [ensureAllLoaded, hasMore]);

  // A fill waits for the whole Library (a failed page counts as done: plan with what came), then reads the latest.
  const libraryLoaded = !recipesLoading && (!hasMore || recipesError != null);
  const libraryRef = useRef<Recipe[]>(recipes);
  const loadedRef = useRef(libraryLoaded);
  const waiting = useRef<(() => void)[]>([]);
  useEffect(() => {
    libraryRef.current = recipes;
    loadedRef.current = libraryLoaded;
    if (!libraryLoaded) return;
    const ready = waiting.current;
    waiting.current = [];
    for (const resolve of ready) resolve();
  }, [libraryLoaded, recipes]);
  const whenLibraryLoaded = useCallback(
    () => new Promise<void>((resolve) => (loadedRef.current ? resolve() : waiting.current.push(resolve))),
    [],
  );

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
  const libraryStatus = useCallback(
    (meals: PlanMeal[]): LibraryOnlyStatus => libraryStatusFor(recipes, avoid, diets, meals),
    [avoid, diets, recipes],
  );

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
      if (!userId || !entries) return { filled: 0, empty: 0, reasons: {}, savedHubRecipes: false };
      // The whole Library first: planning from a part of it would bring in Hub recipes the cook already has.
      await whenLibraryLoaded();
      // The kitchen profile as saved now. If it can't be read, the fill fails: never plan without the allergies.
      const kitchen = await fetchCloudKitchenProfile(userId);
      const kitchenAvoid = { allergies: kitchen.allergies, otherAllergies: kitchen.otherAllergies, dislikes: kitchen.dislikes };
      const hubKey = JSON.stringify([kitchen.diets, kitchenAvoid]);
      const outcome = await fillAndSavePlan(
        {
          userId,
          entries,
          recipes: libraryRef.current,
          avoid: kitchenAvoid,
          diets: kitchen.diets,
          homeNames,
          weekend: weekendFor(language),
          language,
          defaultServings: kitchen.defaultServings ?? 2,
          hubCards: async () => {
            if (hubPool.current?.key !== hubKey) {
              const { cards } = await fetchHubCards({
                diets: kitchen.diets,
                avoid: hubAvoidOf(kitchenAvoid),
                sort: "popular",
                limit: HUB_POOL,
                includeCount: false,
              });
              hubPool.current = { key: hubKey, cards };
            }
            return hubPool.current.cards;
          },
        },
        request,
        onlySlot,
        exclude,
      );
      setReasons((previous) => ({ ...previous, ...outcome.reasons }));
      if (outcome.savedHubRecipes) void refreshRecipes();
      await load();
      return outcome;
    },
    [entries, homeNames, language, load, refreshRecipes, userId, whenLibraryLoaded],
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
