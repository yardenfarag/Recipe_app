/**
 * DOM ids for the editor's fields, so a failed save can move focus to the first thing to fix and a new row can be
 * focused as soon as it renders. Row ids come from shared/lib/recipeEditor.ts and are stable while the editor is open.
 */
export type IngredientPart = "quantity" | "unit" | "name";

export const FIELD_IDS = {
  title: "editor-title",
  photo: "editor-photo",
  servings: "editor-servings",
  time: "editor-time",
  calories: "editor-calories",
  tags: "editor-tags",
  cookNote: "editor-cook-note",
  /** The "Add ingredient" button: where a "needs an ingredient" error points. */
  ingredients: "editor-add-ingredient",
  /** The "Add step" button: where a "needs a step" error points. */
  steps: "editor-add-step",
  banner: "editor-banner",
} as const;

export const ingredientFieldId = (rowId: string, part: IngredientPart) => `editor-ingredient-${rowId}-${part}`;
export const stepFieldId = (rowId: string) => `editor-step-${rowId}`;

/** Focuses an element by id once it exists (after the render that adds it). */
export function focusById(id: string, options: { select?: boolean } = {}): boolean {
  if (typeof document === "undefined") return false;
  const element = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null;
  if (!element) return false;
  element.focus();
  if (options.select && "select" in element) element.select();
  element.scrollIntoView?.({ block: "nearest" });
  return true;
}
