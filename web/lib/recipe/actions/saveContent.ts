import { recipeContentEquals } from "@shared/lib/recipeContentEquals";
import { untypedUpdate } from "@shared/lib/supabase/dbTypes";
import { supabase } from "@shared/lib/supabase/client";
import { recipeContentUpdateRow, updateRecipeContent } from "@shared/lib/supabase/recipes";
import type { Recipe } from "@shared/types/recipe";

import type { ContentChange } from "@/lib/recipe/actions/contentEdits";

/**
 * Saves a change to a recipe's own text and returns the saved row, with `textChanged` when the words changed (the
 * stored translations are gone then, ADR 012). Throws when the save fails; nothing on the page has changed by then.
 */
export async function saveRecipeContent(recipe: Recipe, change: ContentChange): Promise<{ saved: Recipe; textChanged: boolean }> {
  const { update, sourceLanguage } = change;
  const textChanged = !recipeContentEquals(recipe, update) || (sourceLanguage != null && sourceLanguage !== recipe.source_language);

  if (sourceLanguage == null || sourceLanguage === recipe.source_language) {
    return { saved: await updateRecipeContent(recipe.id, update), textChanged };
  }

  // A translation on screen became the recipe's text: one write, so the words and their language never disagree.
  const { data, error } = await supabase
    .from("recipes")
    .update(untypedUpdate<"recipes">({ ...recipeContentUpdateRow(update), source_language: sourceLanguage }))
    .eq("id", recipe.id)
    .select()
    .single();
  if (error) throw error;
  // The stored translations were of the old words. A failure here only leaves an extra translation behind.
  await supabase.from("recipe_translations").delete().eq("recipe_id", recipe.id);
  return { saved: data as unknown as Recipe, textChanged: true };
}
