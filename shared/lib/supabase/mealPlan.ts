/**
 * PIN-77: the meal plan's data. Each person's own rows in `meal_plan_entries`, under RLS; every entry points at one
 * of their recipes (a Hub recipe is saved to the Library first, with claimHubCard). Leftovers point at the entry
 * that makes them, and go when it goes. "Plan my week" remembers its choices in `profiles.meal_plan_prefs`.
 */
import type { MealPlanEntry, MealPlanPrefs, PlanMeal } from '../../types/mealPlan';
import { cleanMealPlanPrefs } from '../mealPlan/week';
import { supabase } from './client';

type EntryRow = {
  id: string;
  plan_date: string;
  meal: string;
  recipe_id: string;
  leftover_of: string | null;
  servings: number;
  locked: boolean;
  cooked_at: string | null;
};

const COLUMNS = 'id, plan_date, meal, recipe_id, leftover_of, servings, locked, cooked_at';

function toEntry(row: EntryRow): MealPlanEntry {
  return {
    id: row.id,
    date: row.plan_date,
    meal: row.meal as PlanMeal,
    recipeId: row.recipe_id,
    leftoverOf: row.leftover_of,
    servings: row.servings,
    locked: row.locked,
    cookedAt: row.cooked_at,
  };
}

/** The plan from `from` to `to`, both included ("2026-11-23"). */
export async function fetchMealPlan(from: string, to: string): Promise<MealPlanEntry[]> {
  const { data, error } = await supabase
    .from('meal_plan_entries')
    .select(COLUMNS)
    .gte('plan_date', from)
    .lte('plan_date', to)
    .order('plan_date');
  if (error) throw error;
  return (data ?? []).map((row) => toEntry(row as EntryRow));
}

/** The plan from `from` to `to` with each meal's recipe title, for places that show a plan without the Library. */
export async function fetchMealPlanWithTitles(from: string, to: string): Promise<(MealPlanEntry & { title: string })[]> {
  const { data, error } = await supabase
    .from('meal_plan_entries')
    .select(`${COLUMNS}, recipes(title)`)
    .gte('plan_date', from)
    .lte('plan_date', to)
    .order('plan_date');
  if (error) throw error;
  return (data ?? []).map((row) => {
    const recipe = (row as { recipes?: { title?: string } | { title?: string }[] | null }).recipes;
    const title = (Array.isArray(recipe) ? recipe[0]?.title : recipe?.title) ?? '';
    return { ...toEntry(row as unknown as EntryRow), title };
  });
}

/** Dinners to remind about, with what the phone's reminders need from each recipe. */
export async function fetchPlannedDinners(
  from: string,
  to: string,
): Promise<{ id: string; date: string; recipeId: string; title: string; minutes: number | null; ingredients: string[] }[]> {
  const { data, error } = await supabase
    .from('meal_plan_entries')
    .select('id, plan_date, recipe_id, leftover_of, cooked_at, recipes(title, estimated_time_minutes, ingredients)')
    .eq('meal', 'dinner')
    .is('leftover_of', null)
    .is('cooked_at', null)
    .gte('plan_date', from)
    .lte('plan_date', to);
  if (error) throw error;
  type Row = {
    id: string;
    plan_date: string;
    recipe_id: string;
    recipes?: { title?: string; estimated_time_minutes?: number | null; ingredients?: { name?: string }[] } | null;
  };
  return ((data ?? []) as unknown as Row[]).map((row) => ({
    id: row.id,
    date: row.plan_date,
    recipeId: row.recipe_id,
    title: row.recipes?.title ?? '',
    minutes: row.recipes?.estimated_time_minutes ?? null,
    ingredients: (row.recipes?.ingredients ?? []).map((ing) => ing.name ?? '').filter(Boolean),
  }));
}

/** A meal to save. Leftovers name the meal that makes them, which is either saved already or in the same call. */
export type NewPlanMeal = {
  date: string;
  meal: PlanMeal;
  recipeId: string;
  servings: number;
  locked?: boolean;
  leftoverOf?: { date: string; meal: PlanMeal } | null;
};

function key(date: string, meal: PlanMeal): string {
  return `${date}|${meal}`;
}

/**
 * Saves filled meals into empty slots. Cooked meals go in first, then their leftovers, which need the cooked meal's
 * id. A slot that already has a meal is replaced (clear its leftovers first with deleteMealPlanEntries).
 */
export async function saveMealPlanMeals(userId: string, meals: NewPlanMeal[]): Promise<MealPlanEntry[]> {
  const row = (meal: NewPlanMeal, leftoverOf: string | null) => ({
    user_id: userId,
    plan_date: meal.date,
    meal: meal.meal,
    recipe_id: meal.recipeId,
    servings: meal.servings,
    locked: meal.locked ?? false,
    leftover_of: leftoverOf,
    cooked_at: null,
  });
  const cooked = meals.filter((meal) => !meal.leftoverOf);
  const leftovers = meals.filter((meal) => meal.leftoverOf);
  const saved: MealPlanEntry[] = [];

  if (cooked.length > 0) {
    const { data, error } = await supabase
      .from('meal_plan_entries')
      .upsert(cooked.map((meal) => row(meal, null)), { onConflict: 'user_id,plan_date,meal' })
      .select(COLUMNS);
    if (error) throw error;
    saved.push(...(data ?? []).map((r) => toEntry(r as EntryRow)));
  }
  if (leftovers.length === 0) return saved;

  // Sources saved earlier aren't in this call: look them up.
  const ids = new Map(saved.map((entry) => [key(entry.date, entry.meal), entry.id]));
  const missing = leftovers
    .map((meal) => meal.leftoverOf!)
    .filter((source) => !ids.has(key(source.date, source.meal)));
  if (missing.length > 0) {
    const dates = missing.map((source) => source.date).sort();
    const earlier = await fetchMealPlan(dates[0], dates[dates.length - 1]);
    for (const entry of earlier) ids.set(key(entry.date, entry.meal), entry.id);
  }
  const rows = leftovers.flatMap((meal) => {
    const sourceId = ids.get(key(meal.leftoverOf!.date, meal.leftoverOf!.meal));
    return sourceId ? [row(meal, sourceId)] : [];
  });
  if (rows.length === 0) return saved;
  const { data, error } = await supabase
    .from('meal_plan_entries')
    .upsert(rows, { onConflict: 'user_id,plan_date,meal' })
    .select(COLUMNS);
  if (error) throw error;
  saved.push(...(data ?? []).map((r) => toEntry(r as EntryRow)));
  return saved;
}

/** Removes meals. Their leftovers go with them (on delete cascade). */
export async function deleteMealPlanEntries(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase.from('meal_plan_entries').delete().in('id', ids);
  if (error) throw error;
}

/**
 * Puts one recipe in a meal, replacing what was there (Add to plan). Saved first, so a failure leaves the plan as it
 * was. The saved meal keeps the slot's row, so leftovers of the old recipe would still point at it: they go.
 */
export async function replacePlanMeal(
  userId: string,
  meal: NewPlanMeal,
  replacing: Pick<MealPlanEntry, 'id' | 'recipeId'> | null,
): Promise<void> {
  await saveMealPlanMeals(userId, [meal]);
  if (replacing && replacing.recipeId !== meal.recipeId) {
    const { error } = await supabase.from('meal_plan_entries').delete().eq('leftover_of', replacing.id);
    if (error) throw error;
  }
}

export async function updateMealPlanEntry(
  id: string,
  change: { locked?: boolean; servings?: number; cookedAt?: string | null },
): Promise<void> {
  const patch: { locked?: boolean; servings?: number; cooked_at?: string | null } = {};
  if (change.locked !== undefined) patch.locked = change.locked;
  if (change.servings !== undefined) patch.servings = change.servings;
  if (change.cookedAt !== undefined) patch.cooked_at = change.cookedAt;
  const { error } = await supabase.from('meal_plan_entries').update(patch).eq('id', id);
  if (error) throw error;
}

export async function fetchMealPlanPrefs(userId: string): Promise<MealPlanPrefs> {
  const { data, error } = await supabase.from('profiles').select('meal_plan_prefs').eq('id', userId).maybeSingle();
  if (error) throw error;
  return cleanMealPlanPrefs(data?.meal_plan_prefs);
}

export async function saveMealPlanPrefs(userId: string, prefs: MealPlanPrefs): Promise<void> {
  const clean = cleanMealPlanPrefs(prefs);
  const { error } = await supabase.from('profiles').update({ meal_plan_prefs: clean }).eq('id', userId);
  if (error) throw error;
}
