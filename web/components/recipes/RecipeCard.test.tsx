import { fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

import type { Recipe } from "@shared/types/recipe";

import { RecipeCard } from "@/components/recipes/RecipeCard";
import i18n from "@/lib/i18n";

vi.mock("@/components/LanguageProvider", () => ({ useLanguage: () => ({ language: "en", setLanguage: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const recipe: Recipe = {
  id: "r1",
  title: "Lemon Pasta",
  ingredients: [],
  instructions: [],
  servings: 2,
  estimated_time_minutes: 25,
  effort_level: "Easy",
  cost_estimate: "$",
  is_favorite: false,
} as unknown as Recipe;

const wrap = (ui: React.ReactNode) => render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);

describe("RecipeCard", () => {
  it("is one link to the recipe, with its time, effort and cost", () => {
    wrap(<RecipeCard recipe={recipe} />);
    expect(screen.getByRole("link", { name: "Lemon Pasta" }).getAttribute("href")).toBe("/recipe/r1");
    expect(screen.getByText("25 min · Easy · Budget")).toBeDefined();
  });

  it("the heart says what it will do, reports its state, and toggles", () => {
    const toggle = vi.fn();
    const { rerender } = wrap(<RecipeCard recipe={recipe} onToggleFavorite={toggle} />);
    const add = screen.getByRole("button", { name: "Add Lemon Pasta to favorites" });
    expect(add.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(add);
    expect(toggle).toHaveBeenCalledWith(recipe);

    rerender(
      <I18nextProvider i18n={i18n}>
        <RecipeCard recipe={{ ...recipe, is_favorite: true }} onToggleFavorite={toggle} />
      </I18nextProvider>,
    );
    expect(screen.getByRole("button", { name: "Remove Lemon Pasta from favorites" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("shows the translated title when there is one, and no buttons when nothing can be done", () => {
    wrap(<RecipeCard recipe={{ ...recipe, display_title: "Pasta al limone" }} />);
    expect(screen.getByRole("link", { name: "Pasta al limone" })).toBeDefined();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
