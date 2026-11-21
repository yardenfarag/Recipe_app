import { fireEvent, render, screen, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { MeasurementSystem } from "@shared/lib/convertMeasurement";
import { displayIngredientAmount } from "@shared/lib/displayIngredientAmount";
import { scaleIngredients } from "@shared/lib/ingredientAmounts";
import type { Ingredient, Recipe } from "@shared/types/recipe";

import { IngredientsPanel } from "@/components/recipe/IngredientsPanel";
import type { AvoidMatches, ReadingChoices, RecipeDisplay } from "@/components/recipe/types";
import i18n, { changeLanguage } from "@/lib/i18n";

const ing = (name: string, quantity: number, unit: string, extra: Partial<Ingredient> = {}): Ingredient =>
  ({ name, quantity, unit, ...extra }) as Ingredient;

const ingredients = [
  ing("flour", 1.5, "cup", { metric: { quantity: 190, unit: "g" } }),
  ing("milk", 1.25, "cups"),
  ing("salt", 0.125, "tsp"),
  ing("vanilla", 0, ""),
];

function makeDisplay(overrides: Partial<RecipeDisplay> = {}, recipe: Partial<Recipe> = {}): RecipeDisplay {
  return {
    recipe: { id: "r1", title: "Pancakes", servings: 4, calories: 800, ingredients, instructions: [], ...recipe } as unknown as Recipe,
    title: "Pancakes",
    ingredients,
    instructions: [],
    contentLanguage: "en",
    translated: false,
    direction: "ltr",
    unitLanguage: "en",
    ...overrides,
  };
}

function renderPanel({
  display = makeDisplay(),
  servings = 4,
  system = "original" as MeasurementSystem,
  avoid = null as AvoidMatches | null,
} = {}) {
  const choices: ReadingChoices = { servings, onServingsChange: vi.fn(), system, onSystemChange: vi.fn() };
  const view = render(
    <I18nextProvider i18n={i18n}>
      <IngredientsPanel display={display} choices={choices} avoid={avoid} />
    </I18nextProvider>,
  );
  return { ...view, choices };
}

/** Each row's amount and name, as the two cells show them. */
const rowCells = () =>
  within(screen.getByRole("list"))
    .getAllByRole("listitem")
    .map((row) => Array.from(row.children).map((cell) => cell.textContent));

// The Hebrew strings load on first use. Load them once up front, so a busy full run can't make a test time out
// halfway through switching language.
beforeAll(async () => {
  await changeLanguage("he");
  await changeLanguage("en");
}, 30_000);

afterEach(async () => {
  await changeLanguage("en");
});

describe("IngredientsPanel", () => {
  it("is a section headed Ingredients, with each amount and name in its own cell", () => {
    renderPanel();
    expect(screen.getByRole("region", { name: "Ingredients" })).toBeDefined();
    expect(screen.getByRole("heading", { level: 2, name: "Ingredients" })).toBeDefined();
    expect(screen.getByText("4 items")).toBeDefined();
    expect(rowCells()).toEqual([
      ["1½ cups", "flour"],
      ["1¼ cups", "milk"],
      ["⅛ tsp", "salt"],
      ["not in the source", "vanilla"],
    ]);
    expect(screen.getByText("Some amounts weren’t in the source — we left them blank.")).toBeDefined();
  });

  it.each([
    [1, "original"],
    [3, "metric"],
    [8, "original"],
    [8, "metric"],
  ] as const)("shows what mobile shows at %i servings in %s", (servings, system) => {
    renderPanel({ servings, system });
    const expected = scaleIngredients(ingredients, 4, servings).map(
      (i) => displayIngredientAmount(i, { system, language: "en" }) || "not in the source",
    );
    expect(rowCells().map(([amount]) => amount)).toEqual(expected);
  });

  it("marks an amount that scaled down to a pinch", () => {
    renderPanel({ servings: 1 });
    const pinch = screen.getByText("a pinch");
    expect(pinch.parentElement?.className).toContain("text-primary");
  });

  it("leaves out the hint for a recipe someone wrote, which has no source to blame", () => {
    renderPanel({ display: makeDisplay({}, { extraction_source: "manual" } as Partial<Recipe>) });
    expect(screen.queryByText("Some amounts weren’t in the source — we left them blank.")).toBeNull();
  });

  it("steps the servings, says the count, and stops at one", () => {
    const { choices, rerender } = renderPanel({ servings: 2 });
    expect(screen.getByRole("group", { name: "Servings" })).toBeDefined();
    expect(screen.getByRole("status").textContent).toContain("2 servings");
    expect(screen.getByText("≈ 400 cal total")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Increase servings" }));
    expect(choices.onServingsChange).toHaveBeenLastCalledWith(3);
    fireEvent.click(screen.getByRole("button", { name: "Decrease servings" }));
    expect(choices.onServingsChange).toHaveBeenLastCalledWith(1);

    const atOne = { ...choices, servings: 1, onServingsChange: vi.fn() };
    rerender(
      <I18nextProvider i18n={i18n}>
        <IngredientsPanel display={makeDisplay()} choices={atOne} avoid={null} />
      </I18nextProvider>,
    );
    const minus = screen.getByRole("button", { name: "Decrease servings" });
    expect(minus.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(minus);
    expect(atOne.onServingsChange).not.toHaveBeenCalled();
  });

  it("switches between spoons and grams as a radio group, by click or arrow key", () => {
    const { choices } = renderPanel();
    const group = screen.getByRole("radiogroup");
    const spoons = within(group).getByRole("radio", { name: "Spoons" });
    const grams = within(group).getByRole("radio", { name: "Grams" });
    expect(spoons.getAttribute("aria-checked")).toBe("true");
    expect(spoons.tabIndex).toBe(0);
    expect(grams.tabIndex).toBe(-1);
    fireEvent.click(grams);
    expect(choices.onSystemChange).toHaveBeenLastCalledWith("metric");
    fireEvent.keyDown(spoons, { key: "ArrowLeft" });
    expect(choices.onSystemChange).toHaveBeenLastCalledWith("metric");
    expect(document.activeElement).toBe(grams);
    expect(screen.queryByText(/Liquids in ml/)).toBeNull();
  });

  it("explains grams when they are on", () => {
    renderPanel({ system: "metric" });
    expect(screen.getByText("Liquids in ml · solids in g · cloves & pinches stay as written")).toBeDefined();
    expect(rowCells()[0][0]).toBe("190 g");
  });

  it("flags allergies and dislikes on their rows", () => {
    renderPanel({ avoid: { allergies: [], dislikes: [], byIngredient: ["allergy", null, "dislike", null] } });
    const rows = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(within(rows[0]).getByText("from your allergies")).toBeDefined();
    expect(within(rows[1]).queryByText(/allergies|don’t like/)).toBeNull();
    expect(within(rows[2]).getByText("a food you don’t like")).toBeDefined();
  });

  it("gives the list the recipe's direction and isolates each cell, so mixed languages read right", async () => {
    await changeLanguage("he");
    const hebrew = [ing("קמח", 2, "cup"), ing("vanilla extract", 1, "tsp"), ing("ביצים", 3, "unit")];
    renderPanel({
      display: makeDisplay({ ingredients: hebrew, contentLanguage: "he", direction: "rtl", unitLanguage: "he" }),
      avoid: { allergies: [], dislikes: [], byIngredient: [null, null, "allergy"] },
    });
    const list = screen.getByRole("list");
    expect(list.getAttribute("dir")).toBe("rtl");
    const rows = within(list).getAllByRole("listitem");
    // The untranslated English name sits in its own isolated cell, apart from its Hebrew amount.
    const [amount, name] = Array.from(rows[1].children);
    expect(amount.querySelector("bdi")?.textContent).toBe("1 כפית");
    expect(name.querySelector("bdi")?.textContent).toBe("vanilla extract");
    // A bare count takes the units' direction, so "3" stays beside the Hebrew around it.
    expect(rows[2].children[0].querySelector("bdi")?.getAttribute("dir")).toBe("rtl");
    expect(rowCells()[0][0]).toBe("2 כוסות");
    // The flag is in the app's language and direction.
    expect(within(rows[2]).getByText("מרשימת האלרגיות שלכם").getAttribute("dir")).toBe("rtl");
  });

  it("keeps an English recipe left-to-right in the Hebrew app", async () => {
    await changeLanguage("he");
    renderPanel({ avoid: { allergies: [], dislikes: [], byIngredient: [null, "dislike", null, null] } });
    expect(screen.getByRole("list").getAttribute("dir")).toBe("ltr");
    expect(rowCells()[0]).toEqual(["1½ cups", "flour"]);
  });
});
