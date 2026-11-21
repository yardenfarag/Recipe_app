import * as editor from "@shared/lib/recipeEditor";
import type { EditorErrors, RecipeEditorState } from "@shared/lib/recipeEditor";

import { FIELD_IDS, ingredientFieldId, stepFieldId } from "@/lib/editor/fieldIds";

/** Errors that only make sense once the cook has tried to save: an empty form isn't wrong, just unfinished. */
const AFTER_ATTEMPT = new Set(["recipeEditor.errors.required", "recipeEditor.errors.needIngredient", "recipeEditor.errors.needStep"]);

/**
 * The errors to show now, as on mobile (src/app/recipe/edit.tsx): hard limits (too long, out of range) while typing,
 * "required" ones only after a save attempt, and the server's messages until their place is edited.
 */
export function visibleErrors(state: RecipeEditorState, attempted: boolean, server: EditorErrors): EditorErrors {
  const live = editor.validate(state);
  const keep = (key: string) => attempted || !AFTER_ATTEMPT.has(key);
  const fields = Object.fromEntries(
    Object.entries(live.fields).filter(([, message]) => message && keep(message.key)),
  ) as EditorErrors["fields"];
  const ingredientRows: EditorErrors["ingredientRows"] = { ...server.ingredientRows };
  for (const [id, row] of Object.entries(live.ingredientRows)) {
    const next = {
      ...ingredientRows[id],
      ...(row.name && keep(row.name.key) ? { name: row.name } : {}),
      ...(row.quantity ? { quantity: row.quantity } : {}),
    };
    if (next.name || next.quantity || next.row) ingredientRows[id] = next;
  }
  return {
    fields: { ...server.fields, ...fields },
    ingredientRows,
    stepRows: { ...server.stepRows, ...live.stepRows },
    recipe: server.recipe,
  };
}

/**
 * The id of the first field to fix, in the order the form reads (title, ingredients, steps, then the side column),
 * or the banner when only the recipe as a whole was blocked. Null when there is nothing to fix.
 */
export function firstErrorFieldId(errors: EditorErrors, state: RecipeEditorState): string | null {
  const { fields } = errors;
  if (errors.recipe.length > 0) return FIELD_IDS.banner;
  if (fields.title) return FIELD_IDS.title;
  for (const row of state.ingredients) {
    const rowErrors = errors.ingredientRows[row.id];
    if (!rowErrors) continue;
    if (rowErrors.quantity && !rowErrors.name && !rowErrors.row) return ingredientFieldId(row.id, "quantity");
    return ingredientFieldId(row.id, "name");
  }
  if (fields.ingredients) return FIELD_IDS.ingredients;
  for (const row of state.steps) {
    if (errors.stepRows[row.id]) return stepFieldId(row.id);
  }
  if (fields.steps) return FIELD_IDS.steps;
  const order = ["photo", "servings", "time", "calories", "tags", "cookNote"] as const;
  for (const key of order) {
    if (fields[key]) return FIELD_IDS[key];
  }
  return null;
}
