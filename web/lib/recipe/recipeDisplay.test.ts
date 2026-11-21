import { describe, expect, it } from "vitest";

import type { Recipe, RecipeTranslationContent } from "@shared/types/recipe";

import { buildRecipeDisplay, needsTranslation } from "@/lib/recipe/recipeDisplay";

const recipe = {
  id: "r1",
  title: "Lemon Pasta",
  source_language: "en",
  servings: 2,
  extraction_status: "full",
  ingredients: [
    { name: "flour", quantity: 2, unit: "cup", metric: { quantity: 250, unit: "g" } },
    { name: "salt", quantity: 1, unit: "tsp" },
  ],
  instructions: [{ step: 1, text: "Mix the flour." }],
} as Recipe;

const hebrew: RecipeTranslationContent = {
  title: "פסטה לימון",
  ingredients: [
    // An old translation: grams from before the amount was fixed, none on the second row.
    { name: "קמח", quantity: 2, unit: "cup", metric: { quantity: 200, unit: "g" } },
    { name: "מלח", quantity: 1, unit: "tsp", spoons: { quantity: 9, unit: "tsp" } },
  ],
  instructions: [{ step: 1, text: "מערבבים את הקמח." }],
};

describe("buildRecipeDisplay", () => {
  it("shows the recipe's own text when the app speaks its language", () => {
    const display = buildRecipeDisplay(recipe, "en", null);
    expect(display).toMatchObject({
      title: "Lemon Pasta",
      contentLanguage: "en",
      translated: false,
      direction: "ltr",
      unitLanguage: "en",
    });
    expect(display.ingredients).toBe(recipe.ingredients);
  });

  it("shows a saved translation, with its units in that language and the grams from the stored row", () => {
    const display = buildRecipeDisplay(recipe, "he", hebrew);
    expect(display).toMatchObject({ title: "פסטה לימון", contentLanguage: "he", translated: true, direction: "rtl", unitLanguage: "he" });
    expect(display.instructions).toBe(hebrew.instructions);
    expect(display.ingredients[0]).toEqual({ name: "קמח", quantity: 2, unit: "כוסות", metric: { quantity: 250, unit: "g" } });
    // The stored row has no spoons for salt, so the translation's stale ones are dropped.
    expect(display.ingredients[1].spoons).toBeUndefined();
    expect(display.ingredients[1].name).toBe("מלח");
  });

  it("shows the recipe in its own language, right to left, when there is no saved translation", () => {
    const own = { ...recipe, title: "פסטה", source_language: "he" } as Recipe;
    const display = buildRecipeDisplay(own, "en", null);
    expect(display).toMatchObject({ title: "פסטה", contentLanguage: "he", translated: false, direction: "rtl", unitLanguage: "he" });
  });

  it("ignores a translation into the recipe's own language", () => {
    const display = buildRecipeDisplay(recipe, "en", hebrew);
    expect(display.translated).toBe(false);
    expect(display.title).toBe("Lemon Pasta");
  });

  it("goes by the text, not the declared language, for recipes saved before it was recorded", () => {
    const untagged = { ...recipe, title: "שקשוקה", source_language: undefined } as Recipe;
    expect(needsTranslation(untagged, "he")).toBe(false);
    expect(needsTranslation(untagged, "en")).toBe(true);
    expect(buildRecipeDisplay(untagged, "en", null).contentLanguage).toBe("he");
  });

  it("an unknown source language leaves the text's language unknown and the units in the app's", () => {
    const other = { ...recipe, source_language: "it" } as Recipe;
    expect(buildRecipeDisplay(other, "es", null)).toMatchObject({ contentLanguage: null, direction: "ltr", unitLanguage: "es" });
  });
});
