import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { hubAvoidOf } from '@shared/lib/hubAvoid';
import type { LibraryOnlyStatus, PlanReason } from '@shared/lib/mealPlan/fillWeek';
import { fillAndSavePlan, libraryStatusFor, type FillOutcome, type FillRequest } from '@shared/lib/mealPlan/planner';
import { cleanMealPlanPrefs, mealsOfDay, weekendFor, type PlanWeek } from '@shared/lib/mealPlan/week';
import { pantryHomeNames } from '@shared/lib/pantry';
import { fetchHubCards } from '@shared/lib/supabase/cookingHub';
import { fetchCloudKitchenProfile } from '@shared/lib/supabase/kitchen';
import {
  deleteMealPlanEntries,
  fetchMealPlan,
  fetchMealPlanPrefs,
  saveMealPlanPrefs,
  updateMealPlanEntry,
} from '@shared/lib/supabase/mealPlan';
import type { MealPlanEntry, MealPlanPrefs, PlanMeal } from '@shared/types/mealPlan';
import type { Recipe } from '@shared/types/recipe';
import type { RecipeCard } from '@shared/types/recipeCard';

import { useAuth } from '@/hooks/useAuth';
import { useKitchenProfile } from '@/hooks/useKitchenProfile';
import { useLanguagePreference } from '@/hooks/useLanguagePreference';
import { usePantry } from '@/hooks/usePantry';
import { useRecipes } from '@/hooks/useRecipes';
import { useStaples } from '@/hooks/useStaples';
import { scheduleMealReminders } from '@/lib/mealPlanReminders';

const HUB_POOL = 240;

/**
 * One week of the signed-in cook's meal plan (PIN-77), and filling it: the same shared planner as the web
 * (shared/lib/mealPlan/planner), fed with the cook's recipes, kitchen profile and what is at home. After every
 * change the phone's reminders for the coming days are scheduled again.
 */
export function useMealPlan(week: PlanWeek) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { language } = useLanguagePreference();
  const { recipes, loading: recipesLoading, hasMore, error: recipesError, ensureAllLoaded, refresh: refreshRecipes } = useRecipes({ pageSize: 40 });
  const { profile } = useKitchenProfile();
  const { staples } = useStaples();
  const { items: pantryItems } = usePantry();
  const [entries, setEntries] = useState<MealPlanEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [prefs, setPrefs] = useState<MealPlanPrefs>(() => cleanMealPlanPrefs(null));
  const [reasons, setReasons] = useState<Record<string, PlanReason>>({});
  const hubPool = useRef<{ key: string; cards: RecipeCard[] } | null>(null);
  const first = week.days[0];
  const last = week.days[6];

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
      setEntries(await fetchMealPlan(first, last));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [first, last, userId]);

  useEffect(() => {
    setEntries(null);
    void load();
  }, [load]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    void fetchMealPlanPrefs(userId)
      .then((saved) => {
        if (active) setPrefs(saved);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [userId]);

  const recipesById = useMemo(() => new Map(recipes.map((recipe) => [recipe.id, recipe])), [recipes]);
  const homeNames = useMemo(() => pantryHomeNames(pantryItems ?? [], staples ?? []), [pantryItems, staples]);
  const avoid = useMemo(
    () => ({ allergies: profile.allergies, otherAllergies: profile.otherAllergies, dislikes: profile.dislikes }),
    [profile],
  );
  const diets = profile.diets;

  // The phone's reminders for today and tomorrow, scheduled again whenever the plan changes.
  useEffect(() => {
    if (entries && userId) void scheduleMealReminders(userId, t, pantryItems ?? []);
  }, [entries, pantryItems, t, userId]);

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
          defaultServings: kitchen.defaultServings ?? 2,
          hubCards: async () => {
            if (hubPool.current?.key !== hubKey) {
              const { cards } = await fetchHubCards({
                diets: kitchen.diets,
                avoid: hubAvoidOf(kitchenAvoid),
                sort: 'popular',
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

  const shuffle = useCallback(
    (entry: MealPlanEntry) =>
      fill(
        { days: [entry.date], meals: [entry.meal], mode: 'reshuffle', useHub: prefs.useHub, leftovers: false, adjust: {} },
        { date: entry.date, meal: entry.meal },
        [entry.recipeId],
      ),
    [fill, prefs.useHub],
  );

  const change = useCallback(
    async (entry: MealPlanEntry, patch: { locked?: boolean; cookedAt?: string | null }) => {
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
