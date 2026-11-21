import * as editor from "@shared/lib/recipeEditor";
import type { RecipeEditorState } from "@shared/lib/recipeEditor";

import type { PastedIngredient } from "@/lib/editor/pasteRows";

/**
 * Row operations the web form adds on top of shared/lib/recipeEditor.ts, built only from its functions so the rules
 * (stable ids, appliance links following steps) stay in one place.
 */

type Inserted = { state: RecipeEditorState; id: string };

/** The id the next added row gets (shared/lib/recipeEditor.ts numbers rows from `nextId`). */
const nextRowId = (state: RecipeEditorState, prefix: "i" | "s") => `${prefix}${state.nextId}`;

/** A blank ingredient right after `afterId` (at the end when it isn't found). Returns its id, to focus it. */
export function insertIngredientAfter(state: RecipeEditorState, afterId: string | null): Inserted {
  const id = nextRowId(state, "i");
  let next = editor.addIngredient(state);
  const at = afterId ? state.ingredients.findIndex((row) => row.id === afterId) : -1;
  if (at >= 0) next = editor.moveIngredient(next, next.ingredients.length - 1, at + 1);
  return { state: next, id };
}

/** A blank step right after `afterId` (at the end when it isn't found). */
export function insertStepAfter(state: RecipeEditorState, afterId: string | null): Inserted {
  const id = nextRowId(state, "s");
  let next = editor.addStep(state);
  const at = afterId ? state.steps.findIndex((row) => row.id === afterId) : -1;
  if (at >= 0) next = editor.moveStep(next, next.steps.length - 1, at + 1);
  return { state: next, id };
}

const isBlankIngredient = (row: { name: string; quantity: string; unit: string }) =>
  !row.name.trim() && !row.quantity.trim() && !row.unit.trim();

/**
 * Pasted lines into the ingredient list at `rowId`: the first fills that row when it is blank (otherwise goes right
 * after it), the rest follow in order. Returns the id of the last row filled, to put the caret there.
 */
export function pasteIngredients(state: RecipeEditorState, rowId: string, lines: PastedIngredient[]): Inserted {
  let next = state;
  const row = state.ingredients.find((item) => item.id === rowId);
  let after = rowId;
  let lastId = rowId;
  lines.forEach((line, index) => {
    if (index === 0 && row && isBlankIngredient(row)) {
      next = editor.updateIngredient(next, rowId, line);
      return;
    }
    const inserted = insertIngredientAfter(next, after);
    next = editor.updateIngredient(inserted.state, inserted.id, line);
    after = inserted.id;
    lastId = inserted.id;
  });
  return { state: next, id: lastId };
}

/** Pasted steps at `rowId`, the same way: a blank step takes the first, the rest follow it. */
export function pasteSteps(state: RecipeEditorState, rowId: string, steps: string[]): Inserted {
  let next = state;
  const row = state.steps.find((item) => item.id === rowId);
  let after = rowId;
  let lastId = rowId;
  steps.forEach((text, index) => {
    if (index === 0 && row && !row.text.trim()) {
      next = editor.updateStep(next, rowId, text);
      return;
    }
    const inserted = insertStepAfter(next, after);
    next = editor.updateStep(inserted.state, inserted.id, text);
    after = inserted.id;
    lastId = inserted.id;
  });
  return { state: next, id: lastId };
}
