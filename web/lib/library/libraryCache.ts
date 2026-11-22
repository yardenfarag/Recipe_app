/**
 * The Library's recipes, kept in memory while the app is open (PIN-174).
 *
 * The mobile app keeps its tabs alive, so coming back to the Library is instant. Pages here unmount when you leave
 * them (Cache Components, which would keep them, stay off: OpenNext on Cloudflare doesn't fully support them yet),
 * so without this the Library fetched every recipe again each time it opened: over a second with 300 recipes on a
 * phone. `useRecipes` shows what is here at once and then refreshes it quietly, so a change made elsewhere still
 * shows.
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

/** Where the Library was scrolled to, by browser history entry, so Back returns to the same place. */
const scrollByEntry = new Map<string, number>();
const MAX_REMEMBERED_SCROLLS = 50;

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
  scrollByEntry.clear();
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

/**
 * The browser's id for the current history entry (the Navigation API). A link to the Library makes a new entry,
 * so it opens at the top; Back and Forward return to an old one. Without the API, nothing is restored.
 */
function historyEntryKey(): string | null {
  if (typeof window === "undefined") return null;
  const navigation = (window as { navigation?: { currentEntry?: { key?: string } | null } }).navigation;
  return navigation?.currentEntry?.key ?? null;
}

export function rememberLibraryScroll(y: number): void {
  const key = historyEntryKey();
  if (!key) return;
  scrollByEntry.delete(key);
  scrollByEntry.set(key, y);
  if (scrollByEntry.size > MAX_REMEMBERED_SCROLLS) scrollByEntry.delete(scrollByEntry.keys().next().value as string);
}

/** Where this history entry's Library was scrolled to, if it was visited before. */
export function rememberedLibraryScroll(): number | null {
  const key = historyEntryKey();
  return key ? (scrollByEntry.get(key) ?? null) : null;
}
