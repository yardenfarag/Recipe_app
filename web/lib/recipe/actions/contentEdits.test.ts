import { describe, expect, it } from "vitest";

import type { TransformedRecipePayload } from "@shared/lib/supabase/transformRecipe";
import type { Recipe } from "@shared/types/recipe";

import type { RecipeDisplay } from "@/components/recipe/types";
import {
  kitchenFixChange,
  promotedLanguage,
  remixChange,
  repairChange,
  repairRequest,
  revertChange,
  shownContent,
  swapChange,
} from "@/lib/recipe/actions/contentEdits";

const recipe = {
  id: "r1",
  title: "Pancakes",
  servings: 2,
  calories: 800,
  source_language: "en",
  extraction_status: "full",
  original_url: "https://example.com/p",
  ingredients: [
    { name: "flour", quantity: 1, unit: "cup", metric: { quantity: 120, unit: "g" } },
    { name: "milk", quantity: 0.5, unit: "cup" },
  ],
  instructions: [{ step: 1, text: "Whisk the flour and milk." }],
  appliances: [],
} as unknown as Recipe;

function displayOf(patch: Partial<RecipeDisplay> = {}, recipePatch: Partial<Recipe> = {}): RecipeDisplay {
  const r = { ...recipe, ...recipePatch };
  return {
    recipe: r,
    title: r.title,
    ingredients: r.ingredients,
    instructions: r.instructions,
    contentLanguage: "en",
    translated: false,
    direction: "ltr",
    unitLanguage: "en",
    ...patch,
  };
}

const hebrew = displayOf({
  title: "פנקייק",
  ingredients: [
    { name: "קמח", quantity: 1, unit: "כוס" },
    { name: "חלב", quantity: 0.5, unit: "כוס" },
  ],
  instructions: [{ step: 1, text: "טורפים." }],
  contentLanguage: "he",
  translated: true,
  direction: "rtl",
  unitLanguage: "he",
});

const remixed: TransformedRecipePayload = {
  servings: 2,
  calories: 600,
  summary: "Used oat milk.",
  ingredients: [{ name: "oat milk", quantity: 0.5, unit: "cup" }],
  instructions: [{ step: 1, text: "Whisk." }],
};

describe("shownContent / promotedLanguage", () => {
  it("uses the words on screen and keeps the stored servings and calories", () => {
    expect(shownContent(hebrew)).toMatchObject({ title: "פנקייק", servings: 2, calories: 800 });
    expect(promotedLanguage(hebrew)).toBe("he");
    expect(promotedLanguage(displayOf())).toBeNull();
  });
});

describe("swapChange", () => {
  it("scales the alternative from the servings on screen back to the recipe's own", () => {
    const { update, sourceLanguage } = swapChange(
      displayOf(),
      0,
      { name: "oat flour", quantity: 2, unit: "cups", metric: { quantity: 200, unit: "g" }, reason: "" },
      4,
      [{ step: 1, text: "Whisk the oat flour and milk." }],
    );
    expect(sourceLanguage).toBeNull();
    expect(update.ingredients[0]).toMatchObject({ name: "oat flour", quantity: 1, unit: "cups", metric: { quantity: 100, unit: "g" } });
    expect(update.ingredients[1].name).toBe("milk");
    expect(update.instructions[0].text).toBe("Whisk the oat flour and milk.");
    expect(update.servings).toBe(2);
    // A swap never touches the kitchen snapshot or the appliances.
    expect(update).not.toHaveProperty("kitchen_original");
    expect(update).not.toHaveProperty("appliances");
  });

  it("saves a translation on screen as the recipe's text, in that language", () => {
    const change = swapChange(hebrew, 1, { name: "חלב שיבולת", quantity: 0.5, unit: "כוס", reason: "" }, 2, hebrew.instructions);
    expect(change.sourceLanguage).toBe("he");
    expect(change.update.title).toBe("פנקייק");
    expect(change.update.ingredients.map((i) => i.name)).toEqual(["קמח", "חלב שיבולת"]);
  });
});

describe("remixChange / kitchenFixChange / revertChange", () => {
  it("a remix replaces the text and clears an earlier kitchen adaptation (ADR 018)", () => {
    const { update } = remixChange(displayOf(), remixed);
    expect(update).toMatchObject({ title: "Pancakes", calories: 600, kitchen_adapted_summary: null, kitchen_original: null });
    expect(update).not.toHaveProperty("appliances");
    expect(remixChange(displayOf(), { ...remixed, appliances: null }).update.appliances).toBeNull();
  });

  it("'Make it without these' keeps the summary and the text before it, for Revert", () => {
    const { update } = kitchenFixChange(displayOf(), remixed);
    expect(update.kitchen_adapted_summary).toBe("Used oat milk.");
    expect(update.kitchen_original).toMatchObject({ title: "Pancakes", ingredients: recipe.ingredients });
  });

  it("keeps an earlier original, so Revert lands on the recipe as it came", () => {
    const first = { title: "First", servings: 1, ingredients: [], instructions: [] };
    expect(kitchenFixChange(displayOf({}, { kitchen_original: first }), remixed).update.kitchen_original).toBe(first);
    const visit = { title: "Before this visit's remix", servings: 1, ingredients: [], instructions: [] };
    expect(kitchenFixChange(displayOf({}, { kitchen_original: first }), remixed, visit).update.kitchen_original).toBe(visit);
  });

  it("revert writes the original back and clears the adaptation", () => {
    const original = { title: "Pancakes", servings: 2, ingredients: recipe.ingredients, instructions: recipe.instructions, calories: 800, appliances: null };
    const { update, sourceLanguage } = revertChange(original, "he");
    expect(update).toMatchObject({ title: "Pancakes", kitchen_adapted_summary: null, kitchen_original: null, appliances: null });
    expect(sourceLanguage).toBe("he");
  });
});

describe("repair", () => {
  it("sends the recipe's own text, never a translation", () => {
    expect(repairRequest(hebrew.recipe)).toMatchObject({ title: "Pancakes", source_language: "en", original_url: "https://example.com/p" });
  });

  it("saves the new extraction status with the repaired text", () => {
    const { update } = repairChange({ ...remixed, title: "Pancakes", extraction_status: "full", appliances: [] });
    expect(update).toMatchObject({ extraction_status: "full", title: "Pancakes", appliances: [] });
  });
});
