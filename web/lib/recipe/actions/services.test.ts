import { beforeEach, describe, expect, it, vi } from "vitest";

import { CURRENT_TRANSLATION_VERSION } from "@shared/lib/translationVersion";
import type { Recipe } from "@shared/types/recipe";

import type { RecipeDisplay } from "@/components/recipe/types";

const calls = vi.hoisted(() => ({
  updateRecipeContent: vi.fn(),
  from: vi.fn(),
  fetchRecipeTranslation: vi.fn(),
  upsertRecipeTranslation: vi.fn(),
  translateRecipe: vi.fn(),
  transformRecipe: vi.fn(),
  createRecipeShare: vi.fn(),
}));

vi.mock("@shared/lib/supabase/recipes", async (original) => ({
  ...(await original<typeof import("@shared/lib/supabase/recipes")>()),
  updateRecipeContent: calls.updateRecipeContent,
}));
vi.mock("@shared/lib/supabase/client", () => ({ supabase: { from: calls.from } }));
vi.mock("@shared/lib/supabase/recipeTranslations", () => ({
  fetchRecipeTranslation: calls.fetchRecipeTranslation,
  upsertRecipeTranslation: calls.upsertRecipeTranslation,
}));
vi.mock("@shared/lib/supabase/translateRecipe", () => ({ translateRecipe: calls.translateRecipe }));
vi.mock("@shared/lib/supabase/transformRecipe", () => ({ transformRecipe: calls.transformRecipe }));
vi.mock("@shared/lib/supabase/recipeShare", () => ({ createRecipeShare: calls.createRecipeShare }));

import { runRemix } from "@/lib/recipe/actions/remix";
import { saveRecipeContent } from "@/lib/recipe/actions/saveContent";
import { shareRecipeLink } from "@/lib/recipe/actions/share";
import { translateRecipeTo } from "@/lib/recipe/actions/translate";

const recipe = {
  id: "r1",
  title: "Pancakes",
  servings: 2,
  source_language: "en",
  extraction_status: "full",
  original_url: "https://example.com/p",
  ingredients: [{ name: "flour", quantity: 1, unit: "cup" }],
  instructions: [{ step: 1, text: "Whisk." }],
} as unknown as Recipe;

const display: RecipeDisplay = {
  recipe,
  title: recipe.title,
  ingredients: recipe.ingredients,
  instructions: recipe.instructions,
  contentLanguage: "en",
  translated: false,
  direction: "ltr",
  unitLanguage: "en",
};

beforeEach(() => {
  for (const fn of Object.values(calls)) fn.mockReset();
});

describe("saveRecipeContent", () => {
  it("saves the recipe's own text with the shared update, and says whether the words changed", async () => {
    calls.updateRecipeContent.mockResolvedValue({ ...recipe, title: "Oat pancakes" });
    const update = { title: "Oat pancakes", servings: 2, ingredients: recipe.ingredients, instructions: recipe.instructions };
    const result = await saveRecipeContent(recipe, { update, sourceLanguage: null });
    expect(calls.updateRecipeContent).toHaveBeenCalledWith("r1", update);
    expect(result.textChanged).toBe(true);
    expect(calls.from).not.toHaveBeenCalled();
  });

  it("a translation that becomes the text is saved with its language, in the same shared update", async () => {
    calls.updateRecipeContent.mockResolvedValue({ ...recipe, title: "פנקייק", source_language: "he" });
    const update = { title: "פנקייק", servings: 2, ingredients: [], instructions: [] };
    const result = await saveRecipeContent(recipe, { update, sourceLanguage: "he" });
    expect(calls.updateRecipeContent).toHaveBeenCalledWith("r1", { ...update, source_language: "he" });
    expect(result).toMatchObject({ textChanged: true, saved: { source_language: "he" } });
  });

  it("the same words under a new language still count as changed: the stored translations are gone", async () => {
    calls.updateRecipeContent.mockResolvedValue({ ...recipe, source_language: "he" });
    const update = { title: recipe.title, servings: 2, ingredients: recipe.ingredients, instructions: recipe.instructions };
    expect((await saveRecipeContent(recipe, { update, sourceLanguage: "he" })).textChanged).toBe(true);
    // The recipe's own language again (a revert): nothing to relabel.
    expect((await saveRecipeContent(recipe, { update, sourceLanguage: "en" })).textChanged).toBe(false);
    expect(calls.updateRecipeContent).toHaveBeenLastCalledWith("r1", update);
  });
});

describe("translateRecipeTo", () => {
  const hebrew = { title: "פנקייק", ingredients: [{ name: "קמח", quantity: 1, unit: "cup" }], instructions: [{ step: 1, text: "טורפים." }] };

  it("uses a stored translation without calling the model", async () => {
    calls.fetchRecipeTranslation.mockResolvedValue({ ...hebrew, translation_version: CURRENT_TRANSLATION_VERSION });
    const outcome = await translateRecipeTo(recipe, "he");
    expect(outcome).toMatchObject({ status: "ok", content: { title: "פנקייק" } });
    expect(calls.translateRecipe).not.toHaveBeenCalled();
    expect(calls.upsertRecipeTranslation).not.toHaveBeenCalled();
  });

  it("shows an older stored translation as it is: only backfill-translations redoes it (PIN-53)", async () => {
    calls.fetchRecipeTranslation.mockResolvedValue(hebrew); // saved before translation versions
    const outcome = await translateRecipeTo(recipe, "he");
    expect(outcome).toMatchObject({ status: "ok", content: { title: "פנקייק" } });
    expect(calls.translateRecipe).not.toHaveBeenCalled();
    expect(calls.upsertRecipeTranslation).not.toHaveBeenCalled();
  });

  it("saves the translator version with a new translation (PIN-53)", async () => {
    calls.fetchRecipeTranslation.mockResolvedValue(null);
    calls.translateRecipe.mockResolvedValue({ status: "ok", translation_version: CURRENT_TRANSLATION_VERSION, recipe: hebrew });
    await translateRecipeTo(recipe, "he");
    expect(calls.upsertRecipeTranslation).toHaveBeenCalledWith("r1", "he", expect.objectContaining({ translation_version: CURRENT_TRANSLATION_VERSION }));
  });

  it("translates from the recipe's own text and stores the result", async () => {
    calls.fetchRecipeTranslation.mockResolvedValue(null);
    calls.translateRecipe.mockResolvedValue({ status: "ok", recipe: hebrew });
    const outcome = await translateRecipeTo(recipe, "he");
    expect(calls.translateRecipe).toHaveBeenCalledWith("he", { title: "Pancakes", ingredients: recipe.ingredients, instructions: recipe.instructions });
    expect(calls.upsertRecipeTranslation).toHaveBeenCalledWith("r1", "he", expect.objectContaining({ title: "פנקייק" }));
    expect(outcome.status).toBe("ok");
  });

  it("says so when the copy can't be stored, and at the daily limit", async () => {
    calls.fetchRecipeTranslation.mockResolvedValue(null);
    calls.translateRecipe.mockResolvedValue({ status: "ok", recipe: hebrew });
    calls.upsertRecipeTranslation.mockRejectedValue(new Error("nope"));
    expect(await translateRecipeTo(recipe, "he")).toEqual({ status: "failed", code: "save_failed" });

    calls.translateRecipe.mockResolvedValue({ status: "failed", code: "daily_limit", message: "limit" });
    expect(await translateRecipeTo(recipe, "es")).toMatchObject({ status: "failed", code: "daily_limit" });
  });

  it("the recipe's own language is just its own words", async () => {
    expect(await translateRecipeTo(recipe, "en")).toEqual({ status: "source" });
    expect(calls.translateRecipe).not.toHaveBeenCalled();
  });
});

describe("runRemix", () => {
  it("adds the reader's allergies to a remix, as mobile does", async () => {
    calls.transformRecipe.mockResolvedValue({ status: "ok", recipe: { summary: "ok" } });
    await runRemix(display, { kind: "remix", variant: "vegan" }, "I am allergic to peanuts");
    expect(calls.transformRecipe).toHaveBeenCalledWith(
      "vegan",
      expect.objectContaining({ id: "r1", title: "Pancakes", servings: 2, original_url: "https://example.com/p" }),
      "I am allergic to peanuts",
    );
    await runRemix(display, { kind: "remix", variant: "custom", instruction: "for 2" }, "I am allergic to peanuts");
    expect(calls.transformRecipe).toHaveBeenLastCalledWith("custom", expect.anything(), "for 2. I am allergic to peanuts");
  });

  it("sends 'Make it without these' as it is", async () => {
    calls.transformRecipe.mockResolvedValue({ status: "ok", recipe: { summary: "ok" } });
    await runRemix(display, { kind: "fix", instruction: "No peanuts" }, "I am allergic to peanuts");
    expect(calls.transformRecipe).toHaveBeenCalledWith("custom", expect.anything(), "No peanuts");
  });

  it("names the reason a remix failed", async () => {
    calls.transformRecipe.mockResolvedValue({ status: "failed", code: "recipe_limit" });
    expect(await runRemix(display, { kind: "remix", variant: "keto" }, null)).toEqual({ status: "failed", reason: "limit" });
    calls.transformRecipe.mockResolvedValue({ status: "failed", code: "instruction_unrelated" });
    expect(await runRemix(display, { kind: "remix", variant: "keto" }, null)).toEqual({ status: "failed", reason: "unrelated" });
    calls.transformRecipe.mockRejectedValue(new Error("offline"));
    expect(await runRemix(display, { kind: "remix", variant: "keto" }, null)).toEqual({ status: "failed", reason: "other" });
  });
});

describe("shareRecipeLink", () => {
  it("copies the Pinch link where the browser has no share sheet", async () => {
    calls.createRecipeShare.mockResolvedValue({ status: "ok", url: "https://pinch-app.io/s/abc" });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    expect(await shareRecipeLink(recipe, "Pancakes")).toBe("copied");
    expect(writeText).toHaveBeenCalledWith("https://pinch-app.io/s/abc");
  });

  it("falls back to the source link, and fails without either", async () => {
    calls.createRecipeShare.mockResolvedValue({ status: "failed", message: "no" });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await shareRecipeLink(recipe, "Pancakes");
    expect(writeText).toHaveBeenCalledWith("https://example.com/p");
    expect(await shareRecipeLink({ ...recipe, original_url: undefined }, "Pancakes")).toBe("failed");
  });
});
