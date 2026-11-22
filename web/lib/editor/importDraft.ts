import type { ExtractedRecipe } from "@shared/lib/supabase/extractRecipe";

/**
 * A partial import waiting to be finished by hand (ADR 019): Snap read only the ingredients or only the steps, and
 * the cook chose "Fill it in myself". The editor (`/recipe/edit?from=import`) opens it, as on mobile. Kept apart from
 * the Snap preview's draft, which is a whole recipe, so Snap doesn't offer a preview of this one.
 */

const STORAGE_KEY = "pinch:import-draft";

/** Only in memory when storage is blocked: the editor still opens it in this tab. */
let memoryDraft: ExtractedRecipe | null = null;

function isRecipe(value: unknown): value is ExtractedRecipe {
  if (!value || typeof value !== "object") return false;
  const recipe = value as Partial<ExtractedRecipe>;
  return typeof recipe.title === "string" && Array.isArray(recipe.ingredients) && Array.isArray(recipe.instructions);
}

export function setImportDraft(recipe: ExtractedRecipe): void {
  memoryDraft = recipe;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(recipe));
  } catch (error) {
    console.warn("[import-draft] persistence failed", error);
  }
}

export function getImportDraft(): ExtractedRecipe | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      if (isRecipe(parsed)) return parsed;
    }
  } catch {
    // Unreadable or blocked: fall back to this tab's copy.
  }
  return memoryDraft;
}

export function clearImportDraft(): void {
  memoryDraft = null;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to remove.
  }
}
