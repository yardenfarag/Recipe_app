import { captureRecipeSaved } from '@/lib/analytics';
import { clearRecipeDraft } from '@/lib/recipeDraft';
import { saveRecipeDraft } from '@/lib/saveRecipeDraft';
import { DEFAULT_SOURCE_LANGUAGE } from '@shared/lib/appLanguages';
import { recipeIsInvented } from '@shared/lib/recipeOrigin';
import type { ExtractedRecipe } from '@shared/types/recipe';

/**
 * Saves an imported recipe to the Library the way Snap does, and counts the automatic save. Throws when the save
 * fails. Doesn't touch the recipe draft, so a batch (the WhatsApp import, ADR 032) can save several at once.
 */
export async function saveImportedRecipe(recipe: ExtractedRecipe): Promise<string> {
  const canonical: ExtractedRecipe = {
    ...recipe,
    source_language: recipe.source_language ?? DEFAULT_SOURCE_LANGUAGE,
  };
  const { recipe: saved, recoveredDuplicate } = await saveRecipeDraft(canonical);
  if (!recoveredDuplicate) {
    captureRecipeSaved({ from: recipeIsInvented(canonical) ? 'invent' : 'extract', save: 'auto' });
  }
  return saved.id;
}

/**
 * Saves a Snap's recipe as soon as it comes in, so it is in the Library even if the cook closes the page. Before
 * this, about a third of the people who got a recipe never tapped Save and left with nothing (Nov 2026).
 *
 * Returns the saved recipe's id, or null when the save failed: the caller then opens the preview, where the draft
 * (already stored with setRecipeDraft) still has its Save button.
 */
export async function autoSaveRecipe(recipe: ExtractedRecipe): Promise<string | null> {
  try {
    const id = await saveImportedRecipe(recipe);
    try {
      // Also acknowledges the extraction's request id, as the preview's Save does.
      await clearRecipeDraft();
    } catch (error) {
      console.warn('[recipe-draft] cleanup failed', error);
    }
    return id;
  } catch (error) {
    console.warn('[auto-save] failed, falling back to the preview', error);
    return null;
  }
}
