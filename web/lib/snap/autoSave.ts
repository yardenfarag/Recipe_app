import { DEFAULT_SOURCE_LANGUAGE } from "@shared/lib/appLanguages";
import { recipeIsInvented } from "@shared/lib/recipeOrigin";
import { saveRecipeDraft } from "@shared/lib/supabase/saveRecipeDraft";
import type { ExtractedRecipe } from "@shared/types/recipe";

import { captureRecipeSaved } from "@/lib/analytics";

/**
 * Saves an imported recipe to the cook's Library, as Snap does straight after an import (many people left the
 * preview without saving and lost the recipe). Returns its id, or null when the save failed; the caller decides
 * what happens then (Snap opens the preview, the WhatsApp import counts it as failed).
 */
export async function autoSaveRecipe(recipe: ExtractedRecipe): Promise<string | null> {
  try {
    const { recipe: saved, recoveredDuplicate } = await saveRecipeDraft({
      ...recipe,
      source_language: recipe.source_language ?? DEFAULT_SOURCE_LANGUAGE,
    });
    if (!recoveredDuplicate) captureRecipeSaved({ from: recipeIsInvented(recipe) ? "invent" : "extract", save: "auto" });
    return saved.id;
  } catch (error) {
    console.warn("[snap] auto-save failed", error);
    return null;
  }
}
