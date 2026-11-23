import { fetchRecipes } from "@shared/lib/supabase/recipes";
import { IMPORTED_IDS_KEY, mergeImportedIds } from "@shared/lib/whatsappImport";

import { getSupabase } from "@/lib/supabase";

/**
 * The chat items this browser already imported (IMPORTED_IDS_KEY), so a chat read again marks them as in the
 * Library. Kept in localStorage; blocked storage only means they show as new again.
 */
export function readImportedIds(): string[] {
  try {
    const raw = window.localStorage.getItem(IMPORTED_IDS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function rememberImportedIds(added: readonly string[]): void {
  if (added.length === 0) return;
  try {
    window.localStorage.setItem(IMPORTED_IDS_KEY, JSON.stringify(mergeImportedIds(readImportedIds(), added)));
  } catch {
    // Not remembered: next time they show as new, and an import of a saved link still costs nothing.
  }
}

/** The source links of the recipes in the cook's Library, to mark links in the chat already saved. */
export async function fetchSavedSourceUrls(): Promise<string[]> {
  try {
    getSupabase();
    const recipes = await fetchRecipes();
    return recipes.map((recipe) => recipe.original_url?.trim()).filter((url): url is string => Boolean(url));
  } catch {
    // Unmarked links still cost nothing to import: the server finds the saved recipe first.
    return [];
  }
}
