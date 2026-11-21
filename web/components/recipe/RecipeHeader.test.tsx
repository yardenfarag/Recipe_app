import { fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

import type { AvoidMatches } from "@shared/lib/avoidList";
import type { Recipe } from "@shared/types/recipe";

import { RecipeHeader } from "@/components/recipe/RecipeHeader";
import { RecipeNotices } from "@/components/recipe/RecipeNotices";
import type { RecipeDisplay } from "@/components/recipe/types";
import { TooltipProvider } from "@/components/ui/Tooltip";
import i18n from "@/lib/i18n";

vi.mock("@/components/LanguageProvider", () => ({ useLanguage: () => ({ language: "en", setLanguage: vi.fn() }) }));
vi.mock("@/lib/library/useCollections", () => ({
  useCollections: () => ({
    collections: [
      { id: "c1", name: "Weeknights", recipeIds: ["r1"] },
      { id: "c2", name: "Baking", recipeIds: ["other"] },
    ],
  }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const recipe = {
  id: "r1",
  title: "Lemon Pasta",
  servings: 2,
  calories: 400,
  estimated_time_minutes: 25,
  effort_level: "Easy",
  cost_estimate: "$",
  extraction_status: "full",
  is_favorite: false,
  original_url: "https://example.com/pasta",
  ingredients: [],
  instructions: [],
} as unknown as Recipe;

const displayOf = (patch: Partial<Recipe> = {}, extra: Partial<RecipeDisplay> = {}): RecipeDisplay => ({
  recipe: { ...recipe, ...patch },
  title: patch.title ?? recipe.title,
  ingredients: [],
  instructions: [],
  contentLanguage: "en",
  translated: false,
  direction: "ltr",
  unitLanguage: "en",
  ...extra,
});

const wrap = (ui: React.ReactNode) =>
  render(
    <I18nextProvider i18n={i18n}>
      <TooltipProvider>{ui}</TooltipProvider>
    </I18nextProvider>,
  );

describe("RecipeHeader", () => {
  it("has the title as the one heading, the facts, its collection and the original post", () => {
    wrap(<RecipeHeader display={displayOf()} servings={2} onToggleFavorite={vi.fn()} />);
    expect(screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent)).toEqual(["Lemon Pasta"]);
    expect(screen.getByText("~200 cal/serving")).toBeDefined();
    expect(screen.getByText("25 min")).toBeDefined();
    expect(screen.getByRole("link", { name: "Open collection Weeknights" }).getAttribute("href")).toBe("/?collection=c1");
    expect(screen.queryByText("Baking")).toBeNull();
    const original = screen.getAllByRole("link").find((link) => link.getAttribute("href") === "https://example.com/pasta");
    expect(original?.getAttribute("target")).toBe("_blank");
    expect(original?.getAttribute("rel")).toContain("noopener");
  });

  it("the heart says what it will do and reports its state", () => {
    const toggle = vi.fn();
    wrap(<RecipeHeader display={displayOf({ is_favorite: true })} servings={2} onToggleFavorite={toggle} />);
    const heart = screen.getByRole("button", { name: "Remove Lemon Pasta from favorites" });
    expect(heart.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(heart);
    expect(toggle).toHaveBeenCalledOnce();
  });
});

const noMatches: AvoidMatches = { allergies: [], dislikes: [], byIngredient: [] };

describe("RecipeNotices", () => {
  it("shows nothing for a complete recipe with nothing to avoid", () => {
    const { container } = wrap(<RecipeNotices display={displayOf()} avoid={noMatches} />);
    expect(container.textContent).toBe("");
  });

  it("lists allergy and dislike matches with the ingredients that matched", () => {
    const avoid: AvoidMatches = {
      allergies: [{ item: "peanuts", allergen: "peanuts", ingredients: ["peanut butter"] }],
      dislikes: [{ item: "cilantro", ingredients: ["fresh cilantro"] }],
      byIngredient: [],
    };
    wrap(<RecipeNotices display={displayOf()} avoid={avoid} />);
    expect(screen.getByText(i18n.t("avoid.bannerAllergyTitle"))).toBeDefined();
    expect(screen.getByText("peanut butter")).toBeDefined();
    expect(screen.getByText(i18n.t("avoid.bannerDislikeTitle"))).toBeDefined();
    expect(screen.getByText("fresh cilantro")).toBeDefined();
  });

  it("says when an import is partial, adapted or translated", () => {
    wrap(
      <RecipeNotices
        display={displayOf({ extraction_status: "partial", kitchen_adapted_summary: "Swapped butter for oil." }, { translated: true, contentLanguage: "he" })}
        avoid={null}
      />,
    );
    expect(screen.getByText(i18n.t("recipe.partialExtraction"))).toBeDefined();
    expect(screen.getByText("Swapped butter for oil.")).toBeDefined();
    expect(screen.getByText("Showing Hebrew")).toBeDefined();
  });
});
