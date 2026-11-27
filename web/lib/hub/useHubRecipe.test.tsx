import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RecipeCard } from "@shared/types/recipeCard";

import { useHubRecipe } from "@/lib/hub/useHubRecipe";

const fetchHubCard = vi.fn();
const fetchLibraryRecipeForCard = vi.fn();
const fetchRecipeCardTranslation = vi.fn();
const translateRecipe = vi.fn();

vi.mock("@shared/lib/supabase/cookingHub", () => ({
  fetchHubCard: (...args: unknown[]) => fetchHubCard(...args),
  fetchLibraryRecipeForCard: (...args: unknown[]) => fetchLibraryRecipeForCard(...args),
  claimHubCard: vi.fn(),
}));
vi.mock("@shared/lib/supabase/recipeCardTranslations", () => ({
  fetchRecipeCardTranslation: (...args: unknown[]) => fetchRecipeCardTranslation(...args),
}));
// A Hub card is never translated from the page: this must stay uncalled.
vi.mock("@shared/lib/supabase/translateRecipe", () => ({ translateRecipe: (...args: unknown[]) => translateRecipe(...args) }));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => ({ user: { id: "u1" }, session: null, loading: false }) }));
let language = "he";
vi.mock("@/components/LanguageProvider", () => ({ useLanguage: () => ({ language, setLanguage: vi.fn() }) }));

const card = {
  id: "card-1",
  title: "Lentil soup",
  source_language: "en",
  ingredients: [{ name: "lentils", quantity: 1, unit: "cup" }],
  instructions: [{ step: 1, text: "Simmer the lentils." }],
  servings: 2,
  tags: [],
  platform: "youtube",
  extraction_status: "full",
  save_count: 0,
  extract_hit_count: 0,
  created_at: "2026-11-01",
} as unknown as RecipeCard;

const hebrew = {
  title: "מרק עדשים",
  ingredients: [{ name: "עדשים", quantity: 1, unit: "cup" }],
  instructions: [{ step: 1, text: "לבשל את העדשים." }],
  translation_version: 3,
};

beforeEach(() => {
  language = "he";
  fetchHubCard.mockReset().mockResolvedValue(card);
  fetchLibraryRecipeForCard.mockReset().mockResolvedValue(null);
  fetchRecipeCardTranslation.mockReset().mockResolvedValue(hebrew);
  translateRecipe.mockReset();
});

describe("useHubRecipe in the cook's language (PIN-77)", () => {
  it("shows the card's saved translation, and its own words on Show original", async () => {
    const { result } = renderHook(() => useHubRecipe("card-1"));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    const ready = () => result.current as Extract<typeof result.current, { status: "ready" }>;

    expect(fetchRecipeCardTranslation).toHaveBeenCalledWith("card-1", "he");
    expect(ready().display).toMatchObject({ title: "מרק עדשים", translated: true, contentLanguage: "he", direction: "rtl" });
    expect(ready().display.ingredients[0].name).toBe("עדשים");
    expect(ready().showingOriginal).toBe(false);

    act(() => ready().setShowOriginal?.(true));
    expect(ready().display).toMatchObject({ title: "Lentil soup", translated: false });
    expect(ready().showingOriginal).toBe(true);

    act(() => ready().setShowOriginal?.(false));
    expect(ready().display.title).toBe("מרק עדשים");
    expect(translateRecipe).not.toHaveBeenCalled();
  });

  it("shows a card without a translation as written, and never translates it", async () => {
    fetchRecipeCardTranslation.mockResolvedValue(null);
    const { result } = renderHook(() => useHubRecipe("card-1"));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    const ready = result.current as Extract<typeof result.current, { status: "ready" }>;
    expect(ready.display).toMatchObject({ title: "Lentil soup", translated: false });
    expect(ready.setShowOriginal).toBeNull();
    expect(translateRecipe).not.toHaveBeenCalled();
  });

  it("doesn't look for a translation into the card's own language, and a failed read shows it as written", async () => {
    language = "en";
    const first = renderHook(() => useHubRecipe("card-1"));
    await waitFor(() => expect(first.result.current.status).toBe("ready"));
    expect(fetchRecipeCardTranslation).not.toHaveBeenCalled();
    first.unmount();

    language = "he";
    fetchRecipeCardTranslation.mockRejectedValue(new Error("offline"));
    const second = renderHook(() => useHubRecipe("card-1"));
    await waitFor(() => expect(second.result.current.status).toBe("ready"));
    expect(second.result.current).toMatchObject({ display: { title: "Lentil soup" } });
  });
});
