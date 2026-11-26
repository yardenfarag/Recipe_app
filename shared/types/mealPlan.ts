/** The meal plan (PIN-77): one recipe per day and meal, for each person. */

/** The meals of a day, in the order they're eaten. Snacks sit between meals. */
export const PLAN_MEALS = ['breakfast', 'snack_am', 'lunch', 'snack_pm', 'dinner'] as const;
export type PlanMeal = (typeof PLAN_MEALS)[number];

/** The three main meals the cook can choose to plan. */
export const MAIN_MEALS = ['breakfast', 'lunch', 'dinner'] as const;
export type MainMeal = (typeof MAIN_MEALS)[number];

/** What a recipe is good for. Both snack slots take a snack. */
export type MealKind = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type SnacksPerDay = 0 | 1 | 2;

/** A row of meal_plan_entries, as the apps use it. */
export type MealPlanEntry = {
  id: string;
  /** The cook's calendar day, "2026-11-27". */
  date: string;
  meal: PlanMeal;
  recipeId: string;
  /** Leftovers or a snack batch: the entry that makes them. */
  leftoverOf: string | null;
  servings: number;
  locked: boolean;
  cookedAt: string | null;
};

/** What "Plan my week" remembers (profiles.meal_plan_prefs). */
export type MealPlanPrefs = {
  meals: MainMeal[];
  snacksPerDay: SnacksPerDay;
  /** Add Hub recipes. Ignored until the Library alone can carry a plan (see libraryOnlyStatus). */
  useHub: boolean;
  /** A dinner covers the next day's lunch. */
  leftovers: boolean;
};

/** The Adjust options. Each one is a rule the planner applies; none of them calls a model. */
export type PlanAdjust = {
  quickWeeknights?: boolean;
  cheaper?: boolean;
  moreProtein?: boolean;
  useUpFridge?: boolean;
  fewerNew?: boolean;
  /** Foods to leave out this week only, as typed. */
  skipFoods?: string[];
};
