import { describe, expect, it } from "vitest";

import * as editor from "@shared/lib/recipeEditor";

import { FIELD_IDS, ingredientFieldId, stepFieldId } from "@/lib/editor/fieldIds";
import { firstErrorFieldId, visibleErrors } from "@/lib/editor/visibleErrors";

describe("visibleErrors", () => {
  it("doesn't call an empty new recipe wrong until a save is tried", () => {
    const state = editor.createEditorState();
    expect(visibleErrors(state, false, editor.noErrors()).fields).toEqual({});
    const shown = visibleErrors(state, true, editor.noErrors());
    expect(shown.fields.title?.key).toBe("recipeEditor.errors.required");
    expect(shown.fields.ingredients?.key).toBe("recipeEditor.errors.needIngredient");
  });

  it("shows hard limits while typing", () => {
    const state = editor.setServings(editor.createEditorState(), "500");
    expect(visibleErrors(state, false, editor.noErrors()).fields.servings?.key).toBe("recipeEditor.errors.outOfRange");
  });
});

describe("firstErrorFieldId", () => {
  it("points at the first problem in reading order", () => {
    let state = editor.createEditorState();
    const row = state.ingredients[0].id;
    state = editor.updateIngredient(state, row, { quantity: "lots" });
    const errors = visibleErrors(state, true, editor.noErrors());
    expect(firstErrorFieldId(errors, state)).toBe(FIELD_IDS.title);

    state = editor.setTitle(state, "Soup");
    expect(firstErrorFieldId(visibleErrors(state, true, editor.noErrors()), state)).toBe(ingredientFieldId(row, "name"));

    state = editor.updateIngredient(state, row, { name: "carrot" });
    expect(firstErrorFieldId(visibleErrors(state, true, editor.noErrors()), state)).toBe(ingredientFieldId(row, "quantity"));

    state = editor.updateIngredient(state, row, { quantity: "2" });
    expect(firstErrorFieldId(visibleErrors(state, true, editor.noErrors()), state)).toBe(FIELD_IDS.steps);
  });

  it("points at a blocked step, or the banner for the recipe as a whole", () => {
    const state = editor.createEditorState();
    const step = state.steps[0].id;
    expect(firstErrorFieldId({ ...editor.noErrors(), stepRows: { [step]: { key: "x" } } }, state)).toBe(stepFieldId(step));
    expect(firstErrorFieldId({ ...editor.noErrors(), recipe: [{ key: "x" }] }, state)).toBe(FIELD_IDS.banner);
    expect(firstErrorFieldId(editor.noErrors(), state)).toBeNull();
  });
});
