import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Recipe } from "@shared/types/recipe";

import { useAutoTranslation } from "@/lib/recipe/useAutoTranslation";

const ensure = vi.hoisted(() => vi.fn());
vi.mock("@shared/lib/ensureRecipeTranslation", () => ({ ensureRecipeTranslation: ensure }));

const recipe = (source_language: string) =>
  ({
    id: "preview",
    title: "שקשוקה",
    source_language,
    servings: 2,
    ingredients: [{ name: "ביצים", quantity: 4, unit: "" }],
    instructions: [{ step: 1, text: "מחממים שמן." }],
  }) as unknown as Recipe;

// One object per recipe, as the page memoizes it (a new object is a new recipe to translate).
const hebrew = recipe("he");

const english = { title: "Shakshuka", ingredients: [{ name: "eggs", quantity: 4, unit: "" }], instructions: [{ step: 1, text: "Heat oil." }] };

describe("useAutoTranslation", () => {
  beforeEach(() => ensure.mockReset());

  it("translates a recipe written in another language into the app's", async () => {
    ensure.mockResolvedValue({ status: "ok", content: english, fromCache: false });
    const { result } = renderHook(() => useAutoTranslation(hebrew, "en"));
    expect(result.current.translating).toBe(true);
    await waitFor(() => expect(result.current.translation).toEqual(english));
    expect(result.current.translating).toBe(false);
    expect(ensure).toHaveBeenCalledWith(expect.objectContaining({ targetLanguage: "en" }));
  });

  it("does nothing for a recipe already in the app's language", () => {
    const { result } = renderHook(() => useAutoTranslation(hebrew, "he"));
    expect(result.current).toEqual({ translation: null, translating: false });
    expect(ensure).not.toHaveBeenCalled();
  });

  it("shows the recipe's own words when translating fails", async () => {
    ensure.mockResolvedValue({ status: "failed", code: "daily_limit" });
    const { result } = renderHook(() => useAutoTranslation(hebrew, "en"));
    await waitFor(() => expect(result.current.translating).toBe(false));
    expect(result.current.translation).toBeNull();
  });
});
