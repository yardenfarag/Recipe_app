import { render, screen, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";

import { convertStepAmounts } from "@shared/lib/convertStepAmounts";
import type { Ingredient, Instruction, Recipe } from "@shared/types/recipe";

import { StepsPanel } from "@/components/recipe/StepsPanel";
import type { RecipeDisplay } from "@/components/recipe/types";
import i18n from "@/lib/i18n";

const ingredients: Ingredient[] = [
  { name: "Unsalted butter", quantity: 2, unit: "tbsp", metric: { quantity: 28, unit: "g" }, spoons: { quantity: 2, unit: "tbsp" } },
  { name: "Flour", quantity: 240, unit: "g", metric: { quantity: 240, unit: "g" }, spoons: { quantity: 2, unit: "cup" } },
];

const instructions: Instruction[] = [
  { step: 1, text: "Melt 1 tablespoon of unsalted butter." },
  { step: 2, text: "Whisk in 120 g flour.", timestamp_seconds: 83 },
];

function displayOf(overrides: Partial<RecipeDisplay> = {}): RecipeDisplay {
  return {
    recipe: { id: "r1", title: "Roux", ingredients, instructions, servings: 2 } as unknown as Recipe,
    title: "Roux",
    ingredients,
    instructions,
    contentLanguage: "en",
    translated: false,
    direction: "ltr",
    unitLanguage: "en",
    ...overrides,
  };
}

const wrap = (ui: React.ReactNode) => render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);

describe("StepsPanel", () => {
  it.each(["metric", "original"] as const)("shows each step converted to the %s system, as mobile does", (system) => {
    wrap(<StepsPanel display={displayOf()} system={system} />);
    for (const step of instructions) {
      const expected = convertStepAmounts(step.text, ingredients, system, "en");
      expect(within(screen.getByTestId(`recipe-step-${step.step}`)).getByText(expected)).toBeDefined();
    }
  });

  it("really rewrites the amounts", () => {
    wrap(<StepsPanel display={displayOf()} system="metric" />);
    expect(screen.getByText("Melt 14 g of unsalted butter.")).toBeDefined();
    wrap(<StepsPanel display={displayOf()} system="original" />);
    expect(screen.getByText("Whisk in 1 cup flour.")).toBeDefined();
  });

  it("has a heading and numbers the steps", () => {
    wrap(<StepsPanel display={displayOf()} system="original" />);
    expect(screen.getByRole("heading", { level: 2, name: "Instructions" })).toBeDefined();
    expect(screen.getByText("2 steps")).toBeDefined();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("lays out a right-to-left recipe right to left, whatever the app's language", () => {
    const hebrew: Instruction[] = [{ step: 1, text: "חממו את התנור." }];
    wrap(<StepsPanel display={displayOf({ instructions: hebrew, direction: "rtl", contentLanguage: "he" })} system="original" />);
    expect(screen.getByRole("list").getAttribute("dir")).toBe("rtl");
    expect(screen.getByText("חממו את התנור.").getAttribute("lang")).toBe("he");
  });

  it("shows when a step happens in the video, without making it a button yet", () => {
    wrap(<StepsPanel display={displayOf()} system="original" />);
    const step = screen.getByTestId("recipe-step-2");
    expect(within(step).getByText("1:23")).toBeDefined();
    expect(within(step).queryByRole("button")).toBeNull();
    expect(within(screen.getByTestId("recipe-step-1")).queryByText(/\d:\d\d/)).toBeNull();
  });

  it("shows nothing for a recipe without steps", () => {
    const { container } = wrap(<StepsPanel display={displayOf({ instructions: [] })} system="original" />);
    expect(container.innerHTML).toBe("");
  });
});
