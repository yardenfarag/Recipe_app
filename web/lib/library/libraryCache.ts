/**
 * The Library's recipes, kept in memory while the app is open (PIN-174).
 *
 * Other screens that list recipes (the cookbook, "add from recipes") start from it instead of fetching every recipe
 * again: over a second with 300 recipes on a phone. The Library itself stays mounted while hidden (PIN-175) and
 * takes what changed here each time it shows. `useRecipes` shows what is here at once and then refreshes it
 * quietly, so a change made elsewhere still shows.
 *
 * Changes made elsewhere in the app that would look wrong even for that moment (a deleted recipe still on screen,
 * a heart that hasn't flipped) are applied here directly as they happen.
 *
 * Memory only: it goes with the tab, and a reload starts fresh.
 */
import type { RecipeCollection } from "@shared/types/collection";
import type { Recipe } from "@shared/types/recipe";

export interface LibrarySnapshot {
  /** Whose recipes, in which language, in pages of what size (`libraryKey`). Another key starts fresh. */
  key: string;
  recipes: Recipe[];
  /** How many recipes the account has, or how many are loaded once the whole library is. */
  total: number;
  /** How many rows have come from the server: the next page starts here. */
  loaded: number;
}

let snapshot: LibrarySnapshot | null = null;
/** The collections row above the list: kept too, so it doesn't arrive late and push the recipes down. */
let collections: { userId: string; collections: RecipeCollection[] } | null = null;

export function libraryKey(userId: string, language: string, pageSize: number): string {
  return `${userId}:${language}:${pageSize}`;
}

export function readLibrary(key: string): LibrarySnapshot | null {
  return snapshot?.key === key ? snapshot : null;
}

export function writeLibrary(next: LibrarySnapshot): void {
  snapshot = next;
}

export function readCollections(userId: string): RecipeCollection[] | null {
  return collections?.userId === userId ? collections.collections : null;
}

export function writeCollections(userId: string, next: RecipeCollection[]): void {
  collections = { userId, collections: next };
}

/** Signed out: nothing of the account stays behind. */
export function forgetLibrary(): void {
  snapshot = null;
  collections = null;
}

/** A recipe deleted outside the Library. */
export function removeFromLibrary(id: string): void {
  if (!snapshot || !snapshot.recipes.some((recipe) => recipe.id === id)) return;
  snapshot = {
    ...snapshot,
    recipes: snapshot.recipes.filter((recipe) => recipe.id !== id),
    total: Math.max(0, snapshot.total - 1),
    loaded: Math.max(0, snapshot.loaded - 1),
  };
}

/** A recipe changed outside the Library (a heart on its page). */
export function patchLibrary(id: string, patch: Partial<Recipe>): void {
  if (!snapshot) return;
  snapshot = { ...snapshot, recipes: snapshot.recipes.map((recipe) => (recipe.id === id ? { ...recipe, ...patch } : recipe)) };
}
