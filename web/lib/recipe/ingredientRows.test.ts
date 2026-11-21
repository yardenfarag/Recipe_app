import { describe, expect, it } from "vitest";

import type { MeasurementSystem } from "@shared/lib/convertMeasurement";
import type { CulinaryUnitLanguage } from "@shared/lib/culinaryUnits";
import { displayedAmountIsPinch, displayIngredientAmount, recipeHasUnknownAmounts } from "@shared/lib/displayIngredientAmount";
import { scaleIngredients } from "@shared/lib/ingredientAmounts";
import type { Ingredient } from "@shared/types/recipe";

import { amountDirection, ingredientRows } from "@/lib/recipe/ingredientRows";

const ing = (name: string, quantity: number, unit: string, extra: Partial<Ingredient> = {}): Ingredient =>
  ({ name, quantity, unit, ...extra }) as Ingredient;

const pancakes = {
  servings: 4,
  ingredients: [
    ing("flour", 1.5, "cup", { metric: { quantity: 190, unit: "g" }, spoons: { quantity: 1.5, unit: "cup" } }),
    ing("milk", 1.25, "cups"),
    ing("sugar", 2, "tbsp"),
    ing("salt", 0.125, "tsp"),
    ing("eggs", 2, "unit"),
    ing("vanilla", 0, ""),
    ing("black pepper", 0, "to taste"),
    ing("butter", 100, "g"),
    ing("nutmeg", 1, "pinch"),
  ],
};

const shakshuka = {
  servings: 3,
  ingredients: [
    ing("עגבניות מרוסקות", 400, "g", { spoons: { quantity: 1.75, unit: "cup" } }),
    ing("ביצים", 6, "unit"),
    ing("שמן זית", 3, "tbsp", { metric: { quantity: 45, unit: "ml" } }),
    ing("כמון", 1, "tsp"),
    ing("פפריקה מעושנת", 0.5, "tsp"),
    ing("vanilla extract", 0.25, "tsp"),
  ],
};

/** What the mobile recipe screen (src/components/RecipeView.tsx) renders for the same inputs, step by step. */
function mobileShows(ingredients: Ingredient[], base: number, servings: number, system: MeasurementSystem, language: CulinaryUnitLanguage) {
  const scaled = scaleIngredients(ingredients, base, servings);
  return {
    amounts: scaled.map((i) => displayIngredientAmount(i, { system, language })),
    pinches: scaled.map((i) => displayedAmountIsPinch(i, { system })),
    unknown: recipeHasUnknownAmounts(scaled, system),
  };
}

describe("ingredientRows", () => {
  for (const [label, recipe] of [
    ["pancakes", pancakes],
    ["shakshuka", shakshuka],
  ] as const) {
    for (const servings of [1, recipe.servings, recipe.servings * 2, 7]) {
      for (const system of ["original", "metric"] as const) {
        for (const unitLanguage of ["en", "he"] as const) {
          it(`${label}: ${servings} servings, ${system}, ${unitLanguage} units match mobile`, () => {
            const { rows, hasUnknownAmounts } = ingredientRows({
              ingredients: recipe.ingredients,
              recipeServings: recipe.servings,
              servings,
              system,
              unitLanguage,
              avoid: null,
            });
            const expected = mobileShows(recipe.ingredients, recipe.servings, servings, system, unitLanguage);
            expect(rows.map((row) => row.amount)).toEqual(expected.amounts);
            expect(rows.map((row) => row.isPinch)).toEqual(expected.pinches);
            expect(hasUnknownAmounts).toBe(expected.unknown);
            expect(rows.map((row) => row.name)).toEqual(recipe.ingredients.map((i) => i.name));
          });
        }
      }
    }
  }

  it("reads like a recipe at the recipe's own count, doubled and for one", () => {
    const at = (servings: number, system: MeasurementSystem, unitLanguage: CulinaryUnitLanguage = "en") =>
      ingredientRows({ ingredients: pancakes.ingredients, recipeServings: 4, servings, system, unitLanguage, avoid: null }).rows.map((r) => r.amount);

    expect(at(4, "original")).toEqual(["1½ cups", "1¼ cups", "2 tbsp", "⅛ tsp", "2", "", "to taste", "3½ oz", "1 pinch"]);
    expect(at(8, "original")).toEqual(["3 cups", "2½ cups", "4 tbsp", "¼ tsp", "4", "", "to taste", "7 oz", "2 pinches"]);
    expect(at(4, "metric")).toEqual(["190 g", "300 ml", "30 ml", "1 ml", "2", "", "to taste", "100 g", "1 pinch"]);
    expect(at(8, "metric", "he")).toEqual(["380 גרם", "600 מ״ל", "60 מ״ל", "1 מ״ל", "4", "", "to taste", "200 גרם", "2 קמצוצים"]);
    // For one, the salt is too little to measure: mobile shows the word and highlights it.
    const one = ingredientRows({ ingredients: pancakes.ingredients, recipeServings: 4, servings: 1, system: "original", unitLanguage: "en", avoid: null });
    expect(one.rows[3]).toMatchObject({ amount: "a pinch", isPinch: true });
    expect(one.hasUnknownAmounts).toBe(true);
  });

  it("scales from the recipe's own count, treating a missing count as one", () => {
    const rows = (recipeServings: number) =>
      ingredientRows({ ingredients: [ing("rice", 1, "cup")], recipeServings, servings: 2, system: "original", unitLanguage: "en", avoid: null }).rows;
    expect(rows(1)[0].amount).toBe("2 cups");
    expect(rows(0)[0].amount).toBe("2 cups");
    expect(rows(4)[0].amount).toBe("½ cups");
  });

  it("carries the avoid list's flag for each row", () => {
    const { rows } = ingredientRows({
      ingredients: pancakes.ingredients.slice(0, 3),
      recipeServings: 4,
      servings: 4,
      system: "original",
      unitLanguage: "en",
      avoid: { allergies: [], dislikes: [], byIngredient: ["allergy", null, "dislike"] },
    });
    expect(rows.map((row) => row.avoid)).toEqual(["allergy", null, "dislike"]);
  });
});

describe("amountDirection", () => {
  it("lets an amount with words find its own direction, and gives a bare number the unit language's", () => {
    expect(amountDirection("2 cups", "he")).toBe("auto");
    expect(amountDirection("2 כוסות", "en")).toBe("auto");
    expect(amountDirection("1½", "he")).toBe("rtl");
    expect(amountDirection("1½", "en")).toBe("ltr");
    expect(amountDirection("3", "ar")).toBe("rtl");
  });
});
