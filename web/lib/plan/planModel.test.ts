import { describe, expect, it } from "vitest";

import type { MealPlanEntry } from "@shared/types/mealPlan";
import type { Recipe } from "@shared/types/recipe";
import type { RecipeCard } from "@shared/types/recipeCard";

import type { IngredientChoice } from "@/lib/list/ingredientChoices";

import { haveCount, hubCardsNotInLibrary, mealsToSave, plannedMeals, selectionWithoutHome, slotsToFill } from "./planModel";

function entry(id: string, date: string, meal: MealPlanEntry["meal"], patch: Partial<MealPlanEntry> = {}): MealPlanEntry {
  return { id, date, meal, recipeId: `r-${id}`, leftoverOf: null, servings: 2, locked: false, cookedAt: null, ...patch };
}

describe("slotsToFill", () => {
  const entries = [
    entry("a", "2026-11-26", "dinner", { locked: true }),
    entry("b", "2026-11-27", "dinner"),
    entry("c", "2026-11-28", "lunch", { leftoverOf: "b" }),
    entry("d", "2026-11-27", "breakfast", { cookedAt: "2026-11-27T08:00:00Z" }),
  ];
  const days = ["2026-11-26", "2026-11-27"];

  it("fills only empty meals", () => {
    const { slots, replace } = slotsToFill(entries, days, ["breakfast", "dinner"], "fill");
    expect(slots).toEqual([{ date: "2026-11-26", meal: "breakfast" }]);
    expect(replace).toEqual([]);
  });

  it("reshuffles meals that aren't locked or cooked, and their leftovers go too", () => {
    const { slots, replace } = slotsToFill(entries, days, ["breakfast", "dinner"], "reshuffle");
    expect(slots).toEqual([
      { date: "2026-11-26", meal: "breakfast" },
      { date: "2026-11-27", meal: "dinner" },
    ]);
    expect(replace.map((e) => e.id)).toEqual(["b", "c"]);
    expect(plannedMeals(entries, replace).map((meal) => meal.candidateId)).toEqual(["r-a", "r-d"]);
  });
});

describe("hubCardsNotInLibrary", () => {
  it("leaves out cards the cook already saved", () => {
    const cards = [
      { id: "1", original_url: "https://a", canonical_url: "a" },
      { id: "2", original_url: "https://b", canonical_url: "b" },
    ] as RecipeCard[];
    const recipes = [{ id: "r", original_url: "https://a" }] as Recipe[];
    expect(hubCardsNotInLibrary(cards, recipes).map((card) => card.id)).toEqual(["2"]);
  });
});

describe("mealsToSave", () => {
  it("cooks more servings for a meal that feeds leftovers, and drops what it can't place", () => {
    const meals = mealsToSave(
      [
        { date: "2026-11-26", meal: "dinner", candidateId: "card-1", leftoverOf: null, reason: { key: "newFromHub" } },
        {
          date: "2026-11-27",
          meal: "lunch",
          candidateId: "card-1",
          leftoverOf: { date: "2026-11-26", meal: "dinner" },
          reason: { key: "leftovers", date: "2026-11-26" },
        },
        { date: "2026-11-27", meal: "dinner", candidateId: "gone", leftoverOf: null, reason: { key: "pick" } },
      ],
      (id) => (id === "card-1" ? "recipe-1" : null),
      3,
    );
    expect(meals).toEqual([
      { date: "2026-11-26", meal: "dinner", recipeId: "recipe-1", servings: 6, leftoverOf: null },
      { date: "2026-11-27", meal: "lunch", recipeId: "recipe-1", servings: 3, leftoverOf: { date: "2026-11-26", meal: "dinner" } },
    ]);
  });
});

describe("what's at home", () => {
  it("counts ingredients at home, not water and salt", () => {
    expect(haveCount(["Spinach", "chickpeas", "salt", "coconut milk"], ["spinach", "chickpeas"])).toEqual({ have: 2, total: 3 });
  });

  it("leaves what's at home unticked", () => {
    const choice = (key: string, name: string) => ({ key, name, amount: "", item: { name } }) as IngredientChoice;
    const selected = selectionWithoutHome([choice("1", "spinach"), choice("2", "coconut milk")], ["Spinach"]);
    expect([...selected]).toEqual(["2"]);
  });
});
