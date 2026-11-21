import type { ExtractedRecipe } from "@shared/lib/supabase/extractRecipe";

import { acknowledgeRequest } from "@/lib/snap/requestIds";

/**
 * The recipe a Snap just made, before it is saved. Kept in localStorage, so a reload or a closed tab can't lose a
 * paid import; the preview page reads it from here. Its request id is forgotten only once it is stored (as on mobile).
 */
export type SnapDraft = {
  version: 1;
  /** Distinguishes one draft from the next, for remembering servings on the preview. */
  id: string;
  recipe: ExtractedRecipe;
  /** Your kitchen preferences couldn't be applied; the preview says so. */
  kitchenFailed?: boolean;
};

const STORAGE_KEY = "pinch:snap-draft";

/** The preview's recipe id, for the servings it remembers (web/lib/recipe/useServings.ts). One at a time. */
export const PREVIEW_RECIPE_ID = "snap-preview";

/** Only in memory when storage is blocked: the preview still works in this tab. */
let memoryDraft: SnapDraft | null = null;

function isDraft(value: unknown): value is SnapDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<SnapDraft>;
  const recipe = draft.recipe as Partial<ExtractedRecipe> | undefined;
  return (
    draft.version === 1 &&
    typeof draft.id === "string" &&
    !!recipe &&
    typeof recipe.title === "string" &&
    Array.isArray(recipe.ingredients) &&
    Array.isArray(recipe.instructions)
  );
}

export async function setSnapDraft(
  recipe: ExtractedRecipe,
  options: { kitchenFailed?: boolean; pending?: { key: string; requestId: string } } = {},
): Promise<SnapDraft> {
  const draft: SnapDraft = {
    version: 1,
    id: globalThis.crypto?.randomUUID?.() ?? `draft-${Date.now()}`,
    recipe,
    ...(options.kitchenFailed ? { kitchenFailed: true } : {}),
  };
  memoryDraft = draft;
  try {
    // A new recipe starts at its own serving count, not the last preview's.
    window.localStorage.removeItem(`pinch:servings:${PREVIEW_RECIPE_ID}`);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch (error) {
    console.warn("[snap] draft persistence failed", error);
  }
  if (options.pending) await acknowledgeRequest(options.pending.key, options.pending.requestId);
  return draft;
}

export function getSnapDraft(): SnapDraft | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isDraft(parsed)) return parsed;
    }
  } catch {
    // Fall back to this tab's copy.
  }
  return memoryDraft;
}

export function clearSnapDraft(): void {
  memoryDraft = null;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing stored.
  }
}
