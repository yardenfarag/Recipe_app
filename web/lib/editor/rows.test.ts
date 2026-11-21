import { describe, expect, it } from "vitest";

import * as editor from "@shared/lib/recipeEditor";
import type { Recipe } from "@shared/types/recipe";

import { insertIngredientAfter, insertStepAfter, pasteIngredients, pasteSteps } from "@/lib/editor/rows";

const recipe = {
  id: "r1",
  user_id: "u1",
  created_at: "2026-11-01T00:00:00Z",
  title: "Soup",
  servings: 2,
  ingredients: [
    { name: "carrot", quantity: 2, unit: "" },
    { name: "water", quantity: 1, unit: "l" },
  ],
  instructions: [
    { step: 1, text: "Chop." },
    { step: 2, text: "Boil." },
  ],
  appliances: [{ key: "stovetop", required: true, steps: [2], origin: "source" }],
} as unknown as Recipe;

describe("insertIngredientAfter", () => {
  it("adds a blank row right after the given one and returns its id", () => {
    const state = editor.createEditorState(recipe);
    const first = state.ingredients[0].id;
    const { state: next, id } = insertIngredientAfter(state, first);
    expect(next.ingredients.map((row) => row.id)).toEqual([first, id, state.ingredients[1].id]);
    expect(next.ingredients[1]).toMatchObject({ name: "", quantity: "", unit: "", source: null });
  });

  it("adds at the end without an id", () => {
    const state = editor.createEditorState(recipe);
    const { state: next, id } = insertIngredientAfter(state, null);
    expect(next.ingredients.at(-1)?.id).toBe(id);
  });
});

describe("insertStepAfter", () => {
  it("keeps appliance links on the steps they belonged to", () => {
    const state = editor.createEditorState(recipe);
    const boil = state.steps[1].id;
    const { state: next } = insertStepAfter(state, state.steps[0].id);
    expect(next.steps).toHaveLength(3);
    expect(next.steps[2].id).toBe(boil);
    expect(editor.applianceStepNumbers(next, "stovetop")).toEqual([3]);
  });
});

describe("pasteIngredients", () => {
  it("fills a blank row with the first line and adds the rest after it", () => {
    let state = editor.createEditorState();
    const blank = state.ingredients[0].id;
    const result = pasteIngredients(state, blank, [
      { quantity: "2", unit: "cups", name: "flour" },
      { quantity: "3", unit: "", name: "eggs" },
    ]);
    state = result.state;
    expect(state.ingredients.map((row) => [row.quantity, row.unit, row.name])).toEqual([
      ["2", "cups", "flour"],
      ["3", "", "eggs"],
    ]);
    expect(result.id).toBe(state.ingredients[1].id);
  });

  it("goes after a row that already has something in it", () => {
    const state = editor.createEditorState(recipe);
    const { state: next } = pasteIngredients(state, state.ingredients[0].id, [
      { quantity: "1", unit: "", name: "onion" },
      { quantity: "", unit: "", name: "salt" },
    ]);
    expect(next.ingredients.map((row) => row.name)).toEqual(["carrot", "onion", "salt", "water"]);
  });
});

describe("pasteSteps", () => {
  it("fills a blank step and adds the rest in order", () => {
    const state = editor.createEditorState();
    const { state: next } = pasteSteps(state, state.steps[0].id, ["Boil.", "Drain.", "Serve."]);
    expect(next.steps.map((row) => row.text)).toEqual(["Boil.", "Drain.", "Serve."]);
  });
});
