/**
 * Weeks for the meal plan (PIN-77). A plan is kept by calendar day ("2026-11-27"), on the cook's own clock, so a
 * week is just seven of those days. Weeks are fixed: they start on Sunday in Hebrew and Arabic and on Monday in the
 * other languages, and the cook plans this week and next, never further.
 */
import { MAIN_MEALS, PLAN_MEALS, type MainMeal, type MealPlanPrefs, type PlanMeal, type SnacksPerDay } from '../../types/mealPlan';
import { pickDay } from '../tonightsPick';

/** 0 = Sunday, 1 = Monday (as Date.getDay()). */
export type WeekStart = 0 | 1;

const SUNDAY_FIRST = new Set(['he', 'ar']);

function language(locale: string): string {
  return locale.toLowerCase().split(/[-_]/)[0];
}

/** The first day of the week in the app language. */
export function weekStartFor(locale: string): WeekStart {
  return SUNDAY_FIRST.has(language(locale)) ? 0 : 1;
}

/** The weekend in the app language (Date.getDay() numbers): Friday and Saturday in Hebrew and Arabic. */
export function weekendFor(locale: string): number[] {
  return SUNDAY_FIRST.has(language(locale)) ? [5, 6] : [6, 0];
}

/** The calendar day of a moment, on the device's clock. */
export function toPlanDate(date: Date): string {
  return pickDay(date);
}

/** A plan day as a Date at local noon, so adding days never trips over a clock change. */
export function parsePlanDate(day: string): Date {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date, 12);
}

export function addDays(day: string, days: number): string {
  const date = parsePlanDate(day);
  date.setDate(date.getDate() + days);
  return toPlanDate(date);
}

export function dayOfWeek(day: string): number {
  return parsePlanDate(day).getDay();
}

export type PlanWeek = {
  /** The first day. */
  start: string;
  /** The seven days, first to last. */
  days: string[];
};

/** The fixed week a day belongs to. */
export function weekOf(day: string, start: WeekStart): PlanWeek {
  const offset = (dayOfWeek(day) - start + 7) % 7;
  const first = addDays(day, -offset);
  return { start: first, days: Array.from({ length: 7 }, (_, index) => addDays(first, index)) };
}

/** The two weeks a cook can plan: this one and the next. */
export function planningWeeks(today: string, start: WeekStart): { thisWeek: PlanWeek; nextWeek: PlanWeek } {
  const thisWeek = weekOf(today, start);
  return { thisWeek, nextWeek: weekOf(addDays(thisWeek.start, 7), start) };
}

/** Whether a week can still be changed: this week or next. Earlier weeks are for looking back or copying. */
export function isPlannableWeek(weekStart: string, today: string, start: WeekStart): boolean {
  const { thisWeek, nextWeek } = planningWeeks(today, start);
  return weekStart === thisWeek.start || weekStart === nextWeek.start;
}

/** Days of a week that can still be planned: today and later. */
export function plannableDays(week: PlanWeek, today: string): string[] {
  return week.days.filter((day) => day >= today);
}

/**
 * The week "Plan my week" opens on. Late in the week (two days or fewer left, today included) there's little to
 * plan, so it opens on next week.
 */
export function defaultPlanWeek(today: string, start: WeekStart): PlanWeek {
  const { thisWeek, nextWeek } = planningWeeks(today, start);
  return plannableDays(thisWeek, today).length <= 2 ? nextWeek : thisWeek;
}

/** The meals of one day for these choices, in eating order. 1 snack = afternoon; 2 = mid-morning and afternoon. */
export function mealsOfDay(meals: readonly MainMeal[], snacksPerDay: SnacksPerDay): PlanMeal[] {
  const wanted = new Set<PlanMeal>(meals);
  if (snacksPerDay >= 1) wanted.add('snack_pm');
  if (snacksPerDay >= 2) wanted.add('snack_am');
  return PLAN_MEALS.filter((meal) => wanted.has(meal));
}

export const DEFAULT_MEAL_PLAN_PREFS: MealPlanPrefs = {
  meals: [...MAIN_MEALS],
  snacksPerDay: 0,
  useHub: true,
  leftovers: true,
};

/** profiles.meal_plan_prefs as the apps use it, whatever was stored. */
export function cleanMealPlanPrefs(value: unknown): MealPlanPrefs {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const meals = Array.isArray(raw.meals)
    ? MAIN_MEALS.filter((meal) => (raw.meals as unknown[]).includes(meal))
    : [...DEFAULT_MEAL_PLAN_PREFS.meals];
  const snacks = raw.snacksPerDay;
  return {
    meals: meals.length > 0 ? meals : [...DEFAULT_MEAL_PLAN_PREFS.meals],
    snacksPerDay: snacks === 1 || snacks === 2 ? snacks : 0,
    useHub: typeof raw.useHub === 'boolean' ? raw.useHub : DEFAULT_MEAL_PLAN_PREFS.useHub,
    leftovers: typeof raw.leftovers === 'boolean' ? raw.leftovers : DEFAULT_MEAL_PLAN_PREFS.leftovers,
  };
}
