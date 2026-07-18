import { ExtractedRecipe } from '@/lib/supabase/extractRecipe';

/** In-memory store for a freshly extracted recipe en route to preview — avoids URL param size limits. */
let draft: ExtractedRecipe | null = null;

export function setRecipeDraft(recipe: ExtractedRecipe): void {
  draft = recipe;
}

export function peekRecipeDraft(): ExtractedRecipe | null {
  return draft;
}

export function clearRecipeDraft(): void {
  draft = null;
}
