import { fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { AvoidMatches } from "@shared/lib/avoidList";
import type { Recipe } from "@shared/types/recipe";

import { fakeActions } from "@/components/recipe/actions/fakeActions";
import { RecipeActionsContext, type RecipeActions } from "@/components/recipe/actions/RecipeActionsContext";
import { addRecipeActionStrings } from "@/components/recipe/actions/testStrings";
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

  it("shows protein, carbs and fat per serving, whatever the servings chosen (PIN-80)", () => {
    const nutrition = { protein_g: 60, carbs_g: 80, fat_g: 36 };
    const { unmount } = wrap(<RecipeHeader display={displayOf({ nutrition })} servings={6} />);
    expect(screen.getByTestId("recipe-nutrition").textContent).toBe("Per serving: 30 g protein · 40 g carbs · 18 g fat");
    unmount();
  });

  it("shows no macros without them, or next to calories the cook set by hand", () => {
    const { unmount } = wrap(<RecipeHeader display={displayOf()} servings={2} />);
    expect(screen.queryByTestId("recipe-nutrition")).toBeNull();
    unmount();
    const nutrition = { protein_g: 60, carbs_g: 80, fat_g: 36 };
    wrap(<RecipeHeader display={displayOf({ nutrition, locked_fields: ["calories"] })} servings={2} />);
    expect(screen.getByText("~200 cal/serving")).toBeDefined();
    expect(screen.queryByTestId("recipe-nutrition")).toBeNull();
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

describe("with recipe actions (a saved recipe's page)", () => {
  beforeAll(() => addRecipeActionStrings());

  const inContext = (ui: React.ReactNode, actions: RecipeActions) =>
    wrap(<RecipeActionsContext.Provider value={actions}>{ui}</RecipeActionsContext.Provider>);

  it("adds Share and a more menu with Edit and Delete, and takes the collections from the page", async () => {
    const display = displayOf();
    const actions = fakeActions(display, { collections: [{ id: "c9", name: "Sundays", recipeIds: ["r1"] }] as RecipeActions["collections"] });
    const onDelete = vi.fn();
    inContext(<RecipeHeader display={display} servings={2} onToggleFavorite={vi.fn()} onDelete={onDelete} />, actions);
    fireEvent.keyDown(screen.getByRole("button", { name: "More options" }), { key: "Enter" });
    expect((await screen.findByRole("menuitem", { name: "Edit recipe" })).getAttribute("href")).toBe("/recipe/edit?id=r1");
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    expect(actions.share).toHaveBeenCalledOnce();
    expect(screen.getByRole("link", { name: "Open collection Sundays" })).toBeDefined();
    expect(screen.queryByText("Weeknights")).toBeNull();
  });

  it("has 'I cooked this', and 'Cooked it again' once it has been cooked", () => {
    const display = displayOf();
    const actions = fakeActions(display);
    const { unmount } = inContext(<RecipeHeader display={display} servings={2} />, actions);
    fireEvent.click(screen.getByRole("button", { name: "I cooked this" }));
    expect(actions.markCooked).toHaveBeenCalledOnce();
    unmount();

    const cooked = displayOf({ last_cooked_at: "2026-11-01T00:00:00Z" });
    inContext(<RecipeHeader display={cooked} servings={2} />, fakeActions(cooked));
    expect(screen.getByRole("button", { name: "Cooked it again" })).toBeDefined();
  });

  it("shows where the recipe was saved from, and the cost as a tier, never an amount", () => {
    wrap(<RecipeHeader display={displayOf({ platform: "tiktok", original_url: "https://www.tiktok.com/@lazy.chef/video/1" })} servings={2} />);
    expect(screen.getByText("Saved from TikTok · @lazy.chef")).toBeDefined();
    expect(screen.getByText("Budget")).toBeDefined();
    expect(screen.queryByText(/\$/)).toBeNull();
  });

  it("offers Add tags, or Edit tags once there are some", () => {
    const actions = fakeActions(displayOf());
    const { unmount } = inContext(<RecipeHeader display={displayOf()} servings={2} />, actions);
    fireEvent.click(screen.getByRole("button", { name: "Add tags" }));
    expect(actions.open).toHaveBeenCalledWith({ kind: "tags" });
    unmount();
    inContext(<RecipeHeader display={displayOf({ tags: ["dinner"] })} servings={2} />, actions);
    expect(screen.getByRole("button", { name: "Edit tags" })).toBeDefined();
  });

  it("shows 'Updating…' for the facts Pinch is recalculating, read out with the field", () => {
    const display = displayOf({ nutrition: { protein_g: 60, carbs_g: 80, fat_g: 36 } });
    inContext(<RecipeHeader display={display} servings={2} />, fakeActions(display, { updatingFields: ["calories", "tags"] }));
    expect(screen.queryByText("~200 cal/serving")).toBeNull();
    expect(screen.queryByTestId("recipe-nutrition")).toBeNull();
    const updating = screen.getAllByTestId("updating-fact");
    expect(updating).toHaveLength(1);
    expect(updating[0].textContent).toBe("Calories: Updating…");
    expect(screen.getByText("25 min")).toBeDefined();
  });

  it("lets the cook add or edit the note next to when it was last cooked", () => {
    const display = displayOf({ last_cooked_at: "2026-11-01T10:00:00Z" });
    const actions = fakeActions(display);
    inContext(<RecipeHeader display={display} servings={2} />, actions);
    fireEvent.click(screen.getByRole("button", { name: "Add a note" }));
    expect(actions.open).toHaveBeenCalledWith({ kind: "note" });
  });
});

describe("RecipeNotices with recipe actions", () => {
  beforeAll(() => addRecipeActionStrings());

  const inContext = (display: RecipeDisplay, actions: RecipeActions, avoid: AvoidMatches | null = null) =>
    wrap(
      <RecipeActionsContext.Provider value={actions}>
        <RecipeNotices display={display} avoid={avoid} />
      </RecipeActionsContext.Provider>,
    );

  it("offers 'Make it without these' on the allergy notice", () => {
    const display = displayOf();
    const actions = fakeActions(display, { canFix: true });
    inContext(display, actions, {
      allergies: [{ item: "peanuts", allergen: "peanuts", ingredients: ["peanut butter"] }],
      dislikes: [{ item: "cilantro", ingredients: ["cilantro"] }],
      byIngredient: [],
    });
    const buttons = screen.getAllByRole("button", { name: "Make it without these" });
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]);
    expect(actions.open).toHaveBeenCalledWith({ kind: "fix" });
  });

  it("offers Repair on a partial import, with what it costs", () => {
    const display = displayOf({ extraction_status: "partial" });
    const actions = fakeActions(display, { canRepair: true });
    inContext(display, actions);
    expect(screen.getByText(i18n.t("recipe.repairHint"))).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Repair recipe" }));
    expect(actions.open).toHaveBeenCalledWith({ kind: "repair" });
  });

  it("names a remix, says what changed and goes back to the original", () => {
    const display = displayOf();
    const actions = fakeActions(display, { adaptation: { kind: "remix", variant: "vegan", summary: "Used tofu." }, canRevert: true });
    inContext(display, actions);
    expect(screen.getByText("Vegan version")).toBeDefined();
    expect(screen.getByText("Used tofu.")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Revert to original" }));
    expect(actions.revert).toHaveBeenCalledOnce();
  });

  it("goes back from a translation, and offers one when the recipe is in another language", () => {
    const translated = displayOf({}, { translated: true, contentLanguage: "he" });
    const first = fakeActions(translated);
    const { unmount } = inContext(translated, first);
    fireEvent.click(screen.getByRole("button", { name: "Show original language" }));
    expect(first.showOriginalLanguage).toHaveBeenCalledOnce();
    unmount();

    const hebrew = displayOf({ title: "שקשוקה", source_language: "he" }, { contentLanguage: "he" });
    const second = fakeActions(hebrew, { translateOffer: "en" });
    inContext(hebrew, second);
    expect(screen.getByText("This recipe is in Hebrew")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Translate to English" }));
    expect(second.translateToAppLanguage).toHaveBeenCalledOnce();
  });
});
