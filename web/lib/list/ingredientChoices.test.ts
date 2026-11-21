import { describe, expect, it } from "vitest";

import { ingredientChoices, initialSelection } from "@/lib/list/ingredientChoices";

const ingredients = [
  { name: "flour", quantity: 2, unit: "cup" },
  { name: "olive oil", quantity: 1, unit: "tbsp" },
  { name: "", quantity: 1, unit: "" },
  { name: "salt", quantity: 0, unit: "" },
];

describe("ingredientChoices", () => {
  it("reads each ingredient as the recipe shows it and as the line it becomes; nameless ones are left out", () => {
    const choices = ingredientChoices(ingredients, { system: "original", unitLanguage: "en", recipeId: "r1" });
    expect(choices.map((choice) => [choice.key, choice.name, choice.amount])).toEqual([
      ["r1:0", "flour", "2 cups"],
      ["r1:1", "olive oil", "1 tbsp"],
      ["r1:2", "salt", ""],
    ]);
    expect(choices[0].item).toEqual({ name: "flour", quantity: 2, unit: "cup", sourceRecipeId: "r1" });
  });
});

describe("initialSelection", () => {
  it("ticks everything but what is kept at home", () => {
    const choices = ingredientChoices(ingredients, { system: "original", unitLanguage: "en", recipeId: "r1" });
    expect([...initialSelection(choices, ["Olive oil", "salt"])]).toEqual(["r1:0"]);
  });
});
