import { fireEvent, render, screen, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";

import type { Instruction, Recipe } from "@shared/types/recipe";

import { RecipeAppliancesSection } from "@/components/recipe/RecipeAppliancesSection";
import type { RecipeDisplay } from "@/components/recipe/types";
import i18n from "@/lib/i18n";

const instructions: Instruction[] = [
  { step: 1, text: "Heat the oven to 180°C." },
  { step: 2, text: "Beat the butter and sugar in the stand mixer until pale." },
  { step: 3, text: "Bake for 25 minutes, until a thermometer reads 95°C." },
];

const appliances = [
  { key: "stand_mixer", required: true, steps: [2], origin: "source" },
  { key: "oven", required: true, steps: [1, 3], origin: "source" },
  { key: "kitchen_thermometer", required: false, benefit: "more_precise", steps: [3], origin: "tip" },
];

function displayOf(recipeAppliances: unknown, overrides: Partial<RecipeDisplay> = {}): RecipeDisplay {
  return {
    recipe: { id: "r1", title: "Cake", ingredients: [], instructions, servings: 8, appliances: recipeAppliances } as unknown as Recipe,
    title: "Cake",
    ingredients: [],
    instructions,
    contentLanguage: "en",
    translated: false,
    direction: "ltr",
    unitLanguage: "en",
    ...overrides,
  };
}

const wrap = (ui: React.ReactNode) => render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);

describe("RecipeAppliancesSection", () => {
  it("shows what the recipe needs, then what makes it better", () => {
    wrap(<RecipeAppliancesSection display={displayOf(appliances)} system="original" />);
    expect(screen.getByRole("heading", { level: 2, name: "What you'll need" })).toBeDefined();
    const required = screen.getByTestId("appliances-required");
    expect(within(required).getByText("Stand mixer")).toBeDefined();
    expect(within(required).getByText("Oven")).toBeDefined();
    const better = screen.getByTestId("appliances-better");
    expect(within(better).getByText("Kitchen thermometer")).toBeDefined();
    expect(within(better).getByTestId("appliance-tip-kitchen_thermometer")).toBeDefined();
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("opens the steps an appliance is used in", () => {
    wrap(<RecipeAppliancesSection display={displayOf(appliances)} system="original" />);
    fireEvent.click(screen.getByTestId("appliance-chip-oven"));
    const dialog = screen.getByRole("dialog", { name: "Oven" });
    expect(within(dialog).getByText("Used in steps 1, 3")).toBeDefined();
    expect(within(dialog).getByTestId("appliance-step-1").textContent).toContain("Heat the oven to 180°C.");
    expect(within(dialog).getByTestId("appliance-step-3").textContent).toContain("Bake for 25 minutes");
    expect(within(dialog).queryByTestId("appliance-step-2")).toBeNull();
  });

  it("explains a Pinch tip and why it helps", () => {
    wrap(<RecipeAppliancesSection display={displayOf(appliances)} system="original" />);
    fireEvent.click(screen.getByTestId("appliance-chip-kitchen_thermometer"));
    const dialog = screen.getByRole("dialog", { name: "Kitchen thermometer" });
    expect(within(dialog).getByText(i18n.t("appliances.pinchTipExplainer"))).toBeDefined();
    expect(within(dialog).getByText(i18n.t("appliances.benefits.more_precise"))).toBeDefined();
    expect(within(dialog).getByText("Used in step 3")).toBeDefined();
  });

  it("shows the steps in the recipe's own direction", () => {
    wrap(<RecipeAppliancesSection display={displayOf(appliances, { direction: "rtl", contentLanguage: "he" })} system="original" />);
    fireEvent.click(screen.getByTestId("appliance-chip-stand_mixer"));
    expect(within(screen.getByRole("dialog")).getByRole("list").getAttribute("dir")).toBe("rtl");
  });

  it("never shows an appliance that points at no real step", () => {
    wrap(<RecipeAppliancesSection display={displayOf([...appliances, { key: "wok", required: true, steps: [9], origin: "source" }])} system="original" />);
    expect(screen.queryByText("Wok")).toBeNull();
  });

  it("shows nothing for a recipe that was never analysed", () => {
    const { container } = wrap(<RecipeAppliancesSection display={displayOf(null)} system="original" />);
    expect(container.innerHTML).toBe("");
  });

  it("says so when the recipe needs no special equipment", () => {
    wrap(<RecipeAppliancesSection display={displayOf([])} system="original" />);
    expect(screen.getByText("No special equipment needed")).toBeDefined();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
