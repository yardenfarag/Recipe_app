import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Recipe } from "@shared/types/recipe";

import { EditTagsDialog } from "@/components/recipe/actions/EditTagsDialog";
import { fakeActions } from "@/components/recipe/actions/fakeActions";
import { MakeItYours } from "@/components/recipe/actions/MakeItYours";
import { RemixSheet } from "@/components/recipe/actions/RemixSheet";
import { SwapDialog } from "@/components/recipe/actions/SwapDialog";
import { addRecipeActionStrings } from "@/components/recipe/actions/testStrings";
import { TranslateDialog } from "@/components/recipe/actions/TranslateDialog";
import type { RecipeDisplay } from "@/components/recipe/types";
import { TooltipProvider } from "@/components/ui/Tooltip";
import i18n from "@/lib/i18n";

const swapLib = vi.hoisted(() => ({ findAlternatives: vi.fn(), stepsAfterSwap: vi.fn() }));
vi.mock("@/lib/recipe/actions/swap", () => swapLib);
const remixLib = vi.hoisted(() => ({ runRemix: vi.fn() }));
vi.mock("@/lib/recipe/actions/remix", async (original) => ({
  ...(await original<typeof import("@/lib/recipe/actions/remix")>()),
  runRemix: remixLib.runRemix,
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
  title: "Pancakes",
  servings: 2,
  source_language: "en",
  extraction_status: "full",
  ingredients: [
    { name: "flour", quantity: 1, unit: "cup" },
    { name: "milk", quantity: 0.5, unit: "cup" },
  ],
  instructions: [{ step: 1, text: "Whisk the flour and milk." }],
} as unknown as Recipe;

const display: RecipeDisplay = {
  recipe,
  title: "Pancakes",
  ingredients: recipe.ingredients,
  instructions: recipe.instructions,
  contentLanguage: "en",
  translated: false,
  direction: "ltr",
  unitLanguage: "en",
};

const wrap = (ui: React.ReactNode) =>
  render(
    <I18nextProvider i18n={i18n}>
      <TooltipProvider>{ui}</TooltipProvider>
    </I18nextProvider>,
  );

beforeAll(() => addRecipeActionStrings());
beforeEach(() => {
  swapLib.findAlternatives.mockReset();
  swapLib.stepsAfterSwap.mockReset();
  remixLib.runRemix.mockReset();
});

describe("SwapDialog", () => {
  const target = { index: 1, ingredient: recipe.ingredients[1], servingsShown: 2 };
  const oat = { name: "oat milk", quantity: 0.5, unit: "cup", reason: "Creamy and mild." };

  it("shows what is replaced, the alternatives and why, then saves the one chosen with the new steps", async () => {
    swapLib.findAlternatives.mockResolvedValue([oat, { name: "water", quantity: 0.5, unit: "cup", reason: "Lighter." }]);
    const steps = [{ step: 1, text: "Whisk the flour and oat milk." }];
    swapLib.stepsAfterSwap.mockResolvedValue(steps);
    const onApply = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    wrap(<SwapDialog target={target} display={display} system="original" onClose={onClose} onApply={onApply} />);

    const dialog = screen.getByRole("dialog", { name: "Swap ingredient" });
    expect(within(dialog).getByText(/^½ cups? milk$/)).toBeDefined();
    expect(await within(dialog).findByText("Creamy and mild.")).toBeDefined();
    fireEvent.click(within(dialog).getByRole("button", { name: "Use oat milk instead" }));
    await waitFor(() => expect(onApply).toHaveBeenCalledWith(target, oat, steps));
    expect(onClose).toHaveBeenCalled();
  });

  it("says when there are no alternatives, and tries again", async () => {
    swapLib.findAlternatives.mockResolvedValueOnce(null).mockResolvedValueOnce([oat]);
    wrap(<SwapDialog target={target} display={display} system="original" onClose={vi.fn()} onApply={vi.fn()} />);
    expect(await screen.findByText(i18n.t("recipe.swapFailed"))).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Creamy and mild.")).toBeDefined();
  });

  it("says the day's swaps are used up, with no Try again", async () => {
    swapLib.findAlternatives.mockResolvedValueOnce({ code: "daily_limit", message: "daily_limit" });
    wrap(<SwapDialog target={target} display={display} system="original" onClose={vi.fn()} onApply={vi.fn()} />);
    expect(await screen.findByText(i18n.t("serverErrors.swapDailyLimit"))).toBeDefined();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("stays open and says why when saving fails, leaving the recipe alone", async () => {
    swapLib.findAlternatives.mockResolvedValue([oat]);
    swapLib.stepsAfterSwap.mockResolvedValue(recipe.instructions);
    const onClose = vi.fn();
    wrap(<SwapDialog target={target} display={display} system="original" onClose={onClose} onApply={vi.fn().mockRejectedValue(new Error("offline"))} />);
    fireEvent.click(await screen.findByRole("button", { name: "Use oat milk instead" }));
    expect(await screen.findByRole("alert")).toBeDefined();
    expect(screen.getByRole("alert").textContent).toContain("Couldn’t save the change");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes with Escape", async () => {
    swapLib.findAlternatives.mockResolvedValue([oat]);
    const onClose = vi.fn();
    wrap(<SwapDialog target={target} display={display} system="original" onClose={onClose} onApply={vi.fn()} />);
    await screen.findByText("Creamy and mild.");
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});

describe("RemixSheet", () => {
  const result = { servings: 2, summary: "Swapped milk for oat milk.", ingredients: [], instructions: [] };

  it("remixes by style, previews what changed, and saves only on 'Use this version'", async () => {
    remixLib.runRemix.mockResolvedValue({ status: "ok", result });
    const onApply = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    wrap(<RemixSheet open preset={null} allergies="I am allergic to peanuts" display={display} onClose={onClose} onApply={onApply} onOutOfCredits={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /^Vegan/ }));
    expect(remixLib.runRemix).toHaveBeenCalledWith(display, { kind: "remix", variant: "vegan" }, "I am allergic to peanuts");
    expect(await screen.findByText("Swapped milk for oat milk.")).toBeDefined();
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Use this version" }));
    await waitFor(() => expect(onApply).toHaveBeenCalledWith(result, "vegan", false));
    expect(onClose).toHaveBeenCalled();
  });

  it("sends the cook's own words with Ctrl+Enter", async () => {
    remixLib.runRemix.mockResolvedValue({ status: "ok", result });
    wrap(<RemixSheet open preset={null} allergies={null} display={display} onClose={vi.fn()} onApply={vi.fn()} onOutOfCredits={vi.fn()} />);
    const field = screen.getByLabelText("What should change?");
    fireEvent.change(field, { target: { value: "for 2, no cream" } });
    fireEvent.keyDown(field, { key: "Enter", ctrlKey: true });
    expect(remixLib.runRemix).toHaveBeenCalledWith(display, { kind: "remix", variant: "custom", instruction: "for 2, no cream" }, null);
    await screen.findByText("Swapped milk for oat milk.");
  });

  it("'Make it without these' starts at once, and is saved as a kitchen fix", async () => {
    remixLib.runRemix.mockResolvedValue({ status: "ok", result });
    const onApply = vi.fn().mockResolvedValue(undefined);
    wrap(<RemixSheet open preset="No peanuts" allergies={null} display={display} onClose={vi.fn()} onApply={onApply} onOutOfCredits={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Make it without these" })).toBeDefined();
    await screen.findByText("Swapped milk for oat milk.");
    expect(remixLib.runRemix).toHaveBeenCalledWith(display, { kind: "fix", instruction: "No peanuts" }, null);
    fireEvent.click(screen.getByRole("button", { name: "Use this version" }));
    await waitFor(() => expect(onApply).toHaveBeenCalledWith(result, "custom", true));
  });

  it("says when the free remixes are used up", async () => {
    remixLib.runRemix.mockResolvedValue({ status: "failed", reason: "limit" });
    wrap(<RemixSheet open preset={null} allergies={null} display={display} onClose={vi.fn()} onApply={vi.fn()} onOutOfCredits={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /^Keto/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("You’ve used all 5 free remixes for this recipe.");
  });
});

describe("TranslateDialog", () => {
  it("translates into the language chosen and closes", async () => {
    const onTranslate = vi.fn().mockResolvedValue({ status: "ok", content: { title: "x", ingredients: [], instructions: [] } });
    const onClose = vi.fn();
    wrap(<TranslateDialog open display={display} onClose={onClose} onTranslate={onTranslate} onShowOriginal={vi.fn()} />);
    const english = screen.getByRole("button", { name: /^English/ });
    expect(english.getAttribute("aria-current")).toBe("true");
    expect(english.textContent).toContain("Original");
    fireEvent.click(screen.getByRole("button", { name: /^עברית/ }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onTranslate).toHaveBeenCalledWith("he");
  });

  it("says why when it can't, and stays open", async () => {
    const onClose = vi.fn();
    wrap(
      <TranslateDialog
        open
        display={display}
        onClose={onClose}
        onTranslate={vi.fn().mockResolvedValue({ status: "failed", code: "daily_limit" })}
        onShowOriginal={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^Español/ }));
    expect((await screen.findByRole("alert")).textContent).toBe(i18n.t("recipe.translateDailyLimit"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("puts the server's code in the app's words, and keeps its internal ones to itself (PIN-158)", async () => {
    const onTranslate = vi
      .fn()
      .mockResolvedValueOnce({ status: "failed", code: "translation_timeout", message: "Translation timed out." })
      .mockResolvedValueOnce({ status: "failed", code: "metering_error", message: "metering_error" });
    wrap(<TranslateDialog open display={display} onClose={vi.fn()} onTranslate={onTranslate} onShowOriginal={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /^Español/ }));
    expect((await screen.findByRole("alert")).textContent).toBe(i18n.t("serverErrors.translateTimedOut"));
    fireEvent.click(screen.getByRole("button", { name: /^Español/ }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(i18n.t("web.recipeActions.translateFailed")));
  });

  it("goes back to the original language from a translation", () => {
    const onShowOriginal = vi.fn();
    wrap(
      <TranslateDialog
        open
        display={{ ...display, translated: true, contentLanguage: "he" }}
        onClose={vi.fn()}
        onTranslate={vi.fn()}
        onShowOriginal={onShowOriginal}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^Original language/ }));
    expect(onShowOriginal).toHaveBeenCalled();
  });
});

describe("EditTagsDialog", () => {
  it("adds with Enter, removes with ×, and saves", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    wrap(<EditTagsDialog open tags={["dinner", "quick"]} onClose={onClose} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: /^Remove tag dinner$/i }));
    const input = screen.getByLabelText("Add a tag");
    fireEvent.change(input, { target: { value: "Brunch" } });
    fireEvent.submit(input.closest("form")!);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })));
    expect(onSave).toHaveBeenCalledWith(["quick", "brunch"]);
    expect(onClose).toHaveBeenCalled();
  });

  it("says when saving fails and keeps the draft", async () => {
    wrap(<EditTagsDialog open tags={["dinner"]} onClose={vi.fn()} onSave={vi.fn().mockRejectedValue(new Error("x"))} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })));
    expect(screen.getByRole("alert").textContent).toBe(i18n.t("tags.saveFailed"));
  });
});

describe("MakeItYours", () => {
  it("has Remix and Translate, each opening its dialog", () => {
    const actions = fakeActions(display);
    wrap(<MakeItYours actions={actions} servings={2} />);
    const bar = screen.getByRole("group", { name: "Actions for Pancakes" });
    fireEvent.click(within(bar).getByRole("button", { name: /Remix it/ }));
    expect(actions.open).toHaveBeenCalledWith({ kind: "remix" });
    fireEvent.click(within(bar).getByRole("button", { name: /Translate/ }));
    expect(actions.open).toHaveBeenCalledWith({ kind: "translate" });
  });

  it("Swap asks which ingredient, then opens the swap for it at the servings on screen", async () => {
    const actions = fakeActions(display);
    wrap(<MakeItYours actions={actions} servings={display.recipe.servings * 2} />);
    fireEvent.click(screen.getByRole("button", { name: /Swap an ingredient/ }));
    const picker = await screen.findByRole("dialog", { name: "Swap an ingredient" });
    const first = display.ingredients[0];
    fireEvent.click(within(picker).getByRole("button", { name: first.name }));
    expect(actions.open).toHaveBeenCalledWith({
      kind: "swap",
      target: { index: 0, servingsShown: display.recipe.servings * 2, ingredient: expect.objectContaining({ name: first.name }) },
    });
  });

  it("the kitchen fix starts the fix when there is something to fix, and otherwise leads to the kitchen settings", () => {
    const fixable = fakeActions(display, { canFix: true });
    const { unmount } = wrap(<MakeItYours actions={fixable} servings={2} />);
    fireEvent.click(screen.getByRole("button", { name: /Fix for my kitchen/ }));
    expect(fixable.open).toHaveBeenCalledWith({ kind: "fix" });
    unmount();

    wrap(<MakeItYours actions={fakeActions(display)} servings={2} />);
    expect(screen.getByRole("link", { name: /Fix for my kitchen/ }).getAttribute("href")).toBe("/settings/recipe");
  });

  it.each([
    [{ avoid: false, appliances: false }, "web.recipe.fixNothing"],
    [{ avoid: true, appliances: true }, "web.recipe.fixClearKitchen"],
    [{ avoid: true, appliances: false }, "web.recipe.fixClear"],
    [{ avoid: false, appliances: true }, "web.recipe.fixClearTools"],
  ])("with nothing to fix, the tile says what Pinch checked (%o)", (kitchenSetUp, key) => {
    wrap(<MakeItYours actions={fakeActions(display, { kitchenSetUp })} servings={2} />);
    const tile = screen.getByRole("link", { name: /Fix for my kitchen/ });
    expect(tile.textContent).toContain(i18n.t(key));
    expect(tile.getAttribute("href")).toBe("/settings/recipe");
  });
});
