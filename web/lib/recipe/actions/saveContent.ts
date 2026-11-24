import { recipeContentEquals } from "@shared/lib/recipeContentEquals";
import { updateRecipeContent } from "@shared/lib/supabase/recipes";
import type { Recipe } from "@shared/types/recipe";

import type { ContentChange } from "@/lib/recipe/actions/contentEdits";

/**
 * Saves a change to a recipe's own text and returns the saved row, with `textChanged` when the words changed (the
 * stored translations are gone then, ADR 012). Throws when the save fails; nothing on the page has changed by then.
 */
export async function saveRecipeContent(recipe: Recipe, change: ContentChange): Promise<{ saved: Recipe; textChanged: boolean }> {
  const { update, sourceLanguage } = change;
  // A translation on screen became the recipe's text: its language is saved in the same write as the words.
  const promoted = sourceLanguage != null && sourceLanguage !== recipe.source_language;
  const saved = await updateRecipeContent(recipe.id, promoted ? { ...update, source_language: sourceLanguage } : update);
  return { saved, textChanged: promoted || !recipeContentEquals(recipe, update) };
}
