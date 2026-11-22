import { fireEvent, render, screen, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

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

  it("without a playable video, shows when a step happens in the video, without a button", () => {
    wrap(<StepsPanel display={displayOf()} system="original" />);
    const step = screen.getByTestId("recipe-step-2");
    expect(within(step).getByText("1:23")).toBeDefined();
    expect(within(step).queryByRole("button")).toBeNull();
    expect(within(screen.getByTestId("recipe-step-1")).queryByText(/\d:\d\d/)).toBeNull();
  });

  it("with a video, a step's time plays the video from there", () => {
    const onPlayAt = vi.fn();
    wrap(<StepsPanel display={displayOf()} system="original" video={{ onPlayAt, activeStep: null }} />);
    const button = within(screen.getByTestId("recipe-step-2")).getByRole("button");
    expect(button.textContent).toContain("1:23");
    fireEvent.click(button);
    expect(onPlayAt).toHaveBeenCalledWith(83);
    expect(within(screen.getByTestId("recipe-step-1")).queryByRole("button")).toBeNull();
  });

  it("marks the step the video is on", () => {
    wrap(<StepsPanel display={displayOf()} system="original" video={{ onPlayAt: vi.fn(), activeStep: 2 }} />);
    expect(screen.getByTestId("recipe-step-2").getAttribute("aria-current")).toBe("step");
    expect(screen.getByTestId("recipe-step-1").getAttribute("aria-current")).toBeNull();
  });

  it("offers cook mode by the heading when asked", () => {
    const onCookMode = vi.fn();
    wrap(<StepsPanel display={displayOf()} system="original" onCookMode={onCookMode} />);
    fireEvent.click(screen.getByRole("button", { name: "Start cooking" }));
    expect(onCookMode).toHaveBeenCalled();
  });

  it("turns a time in a step into a timer, and shows the countdown while it runs", () => {
    const steps = [{ step: 1, text: "Simmer for 10 minutes." }];
    const start = vi.fn();
    const stop = vi.fn();
    const { rerender } = wrap(<StepsPanel display={displayOf({ instructions: steps })} system="original" timers={{ timers: [], now: 0, start, stop }} />);
    fireEvent.click(screen.getByRole("button", { name: "Start 10 minutes timer" }));
    expect(start).toHaveBeenCalledWith("10 minutes", 600, 1);

    const running = { id: "t1", label: "10 minutes", step: 1, seconds: 600, endsAt: 600_000 };
    rerender(
      <I18nextProvider i18n={i18n}>
        <StepsPanel display={displayOf({ instructions: steps })} system="original" timers={{ timers: [running], now: 15_000, start, stop }} />
      </I18nextProvider>,
    );
    expect(screen.getByRole("timer").textContent).toBe("9:45");
    fireEvent.click(screen.getByRole("button", { name: "Stop the 10 minutes timer" }));
    expect(stop).toHaveBeenCalledWith("t1");
  });

  it("shows nothing for a recipe without steps", () => {
    const { container } = wrap(<StepsPanel display={displayOf({ instructions: [] })} system="original" />);
    expect(container.innerHTML).toBe("");
  });
});
