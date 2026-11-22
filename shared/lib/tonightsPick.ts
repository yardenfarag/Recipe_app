import { scoreCookTonight, type CookTonightFilters } from './cookTonight';
import type { Recipe } from '../types/recipe';

const DAY_MS = 24 * 60 * 60 * 1000;

/** What "Cook tonight" means in the Library: done in 45 minutes, and not hard. */
export const COOK_TONIGHT_LIMITS: CookTonightFilters = { maxMinutes: 45, maxEffort: 'Medium' };

/** A recipe counts as new for this long after it was saved. */
export const PICK_NEW_DAYS = 30;
/** A recipe cooked this recently isn't suggested again. */
export const PICK_REST_DAYS = 14;

/** The day a pick belongs to, on the cook's own clock: "2026-11-22". */
export function pickDay(now: Date): string {
  const two = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
}

/** A number from a piece of text, the same every time (FNV-1a). */
function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

function within(iso: string | undefined, now: Date, days: number): boolean {
  if (!iso) return false;
  const time = Date.parse(iso);
  return Number.isFinite(time) && now.getTime() - time < days * DAY_MS;
}

/**
 * The recipes "Tonight's pick" may suggest today, in the order "Show me another" walks through them.
 *
 * 1. Saved in the last 30 days, never cooked, and fits "Cook tonight".
 * 2. If there are none: anything not cooked in the last two weeks.
 * 3. If there are still none (everything was cooked recently): anything.
 *
 * The order is shuffled by the date, so it is the same all day and different tomorrow, and doesn't depend on the
 * order the recipes arrive in.
 */
export function tonightsPickCandidates(recipes: Recipe[], now: Date): Recipe[] {
  const fresh = recipes.filter(
    (recipe) =>
      !recipe.last_cooked_at &&
      within(recipe.created_at, now, PICK_NEW_DAYS) &&
      scoreCookTonight(recipe, COOK_TONIGHT_LIMITS) != null,
  );
  const rested = fresh.length > 0 ? fresh : recipes.filter((recipe) => !within(recipe.last_cooked_at, now, PICK_REST_DAYS));
  const pool = rested.length > 0 ? rested : recipes;
  const day = pickDay(now);
  return pool
    .map((recipe) => ({ recipe, key: hash(`${day}:${recipe.id}`) }))
    .sort((a, b) => a.key - b.key || a.recipe.id.localeCompare(b.recipe.id))
    .map((row) => row.recipe);
}

/** What was shown as the pick, and on which day, so a reload shows the same one. */
export type TonightsPickMemory = { day: string; recipeId: string };

/**
 * Tonight's pick. The one already shown today stays (while it is still in the library), so reloading, or more
 * recipes loading in, doesn't change it. Null for an empty library.
 */
export function tonightsPick(recipes: Recipe[], now: Date, memory?: TonightsPickMemory | null): Recipe | null {
  if (memory && memory.day === pickDay(now)) {
    const kept = recipes.find((recipe) => recipe.id === memory.recipeId);
    if (kept) return kept;
  }
  return tonightsPickCandidates(recipes, now)[0] ?? null;
}

/** "Show me another": the candidate after the current one, wrapping round. Null when there is no other. */
export function nextTonightsPick(recipes: Recipe[], now: Date, currentId: string | null): Recipe | null {
  const order = tonightsPickCandidates(recipes, now);
  const others = order.filter((recipe) => recipe.id !== currentId);
  if (others.length === 0) return null;
  const index = order.findIndex((recipe) => recipe.id === currentId);
  // The current one may not be a candidate (it was kept from earlier today): start from the top.
  return index < 0 ? others[0] : order[(index + 1) % order.length];
}

/** The recipes cooked in the last `days` days, most recent first: the Library's "Cooked this week" tile. */
export function recipesCookedWithin(recipes: Recipe[], now: Date, days = 7): Recipe[] {
  return recipes
    .filter((recipe) => within(recipe.last_cooked_at, now, days))
    .sort((a, b) => Date.parse(b.last_cooked_at ?? '') - Date.parse(a.last_cooked_at ?? ''));
}
