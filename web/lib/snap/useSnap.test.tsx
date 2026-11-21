import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/lib/i18n";
import { clearSnapDraft, getSnapDraft } from "@/lib/snap/draft";
import { useSnap } from "@/lib/snap/useSnap";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  extractRecipe: vi.fn(),
  extractRecipeFromImage: vi.fn(),
  extractRecipeFromPdf: vi.fn(),
  inventRecipe: vi.fn(),
  inventRecipeFromImage: vi.fn(),
  applyKitchen: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, replace: vi.fn() }) }));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => ({ user: { id: "user-1" }, session: null, loading: false }) }));
vi.mock("@/components/LanguageProvider", () => ({ useLanguage: () => ({ language: "he", setLanguage: vi.fn() }) }));
vi.mock("@shared/lib/supabase/extractRecipe", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@shared/lib/supabase/extractRecipe")>()),
  extractRecipe: mocks.extractRecipe,
  extractRecipeFromImage: mocks.extractRecipeFromImage,
  extractRecipeFromPdf: mocks.extractRecipeFromPdf,
}));
vi.mock("@shared/lib/supabase/inventRecipe", () => ({ inventRecipe: mocks.inventRecipe, inventRecipeFromImage: mocks.inventRecipeFromImage }));
vi.mock("@shared/lib/supabase/kitchenAutoApply", () => ({ applyKitchenOnExtract: mocks.applyKitchen }));
vi.mock("@shared/lib/toast", () => ({ showToast: mocks.toast }));

const recipe = {
  title: "Shakshuka",
  servings: 2,
  ingredients: [{ name: "eggs", quantity: 4, unit: "" }],
  instructions: [{ step: 1, text: "Cook." }],
  extraction_status: "full" as const,
};

const wrapper = ({ children }: { children: ReactNode }) => <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
const url = { type: "url" as const, url: "https://www.youtube.com/watch?v=abc123def45" };

describe("useSnap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    clearSnapDraft();
    mocks.applyKitchen.mockImplementation(async (_user: string, input: typeof recipe) => ({ recipe: input, failed: false }));
  });

  it("stores a whole recipe as the draft, then opens the preview", async () => {
    mocks.extractRecipe.mockResolvedValue({ status: "full", platform: "youtube", recipe, request_id: "req-1" });
    const onSettled = vi.fn();
    const { result } = renderHook(() => useSnap({ onSettled }), { wrapper });

    await act(() => result.current.run({ intent: "extract", source: url }));

    expect(mocks.extractRecipe).toHaveBeenCalledWith(expect.anything(), url.url, { forceExtract: undefined });
    expect(getSnapDraft()?.recipe.title).toBe("Shakshuka");
    expect(mocks.push).toHaveBeenCalledWith("/recipe/preview");
    expect(onSettled).toHaveBeenCalled();
    // The progress stays up until the preview opens.
    expect(result.current.job).not.toBeNull();
  });

  it("says when the credits have run out, and opens nothing", async () => {
    mocks.extractRecipe.mockResolvedValue({ status: "failed", platform: "unknown", code: "insufficient_credits" });
    const { result } = renderHook(() => useSnap(), { wrapper });

    await act(() => result.current.run({ intent: "extract", source: url }));

    expect(result.current.banner?.tone).toBe("credits");
    expect(result.current.job).toBeNull();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("opens a recipe that is already saved", async () => {
    mocks.extractRecipe.mockResolvedValue({ status: "full", platform: "youtube", cached: true, recipe: { ...recipe, id: "r9" } });
    const { result } = renderHook(() => useSnap(), { wrapper });

    await act(() => result.current.run({ intent: "extract", source: url }));

    expect(mocks.push).toHaveBeenCalledWith("/recipe/r9");
  });

  it("offers Guess the recipe for a dish, and guesses in the app language without a second food check", async () => {
    mocks.extractRecipe.mockResolvedValue({ status: "failed", platform: "youtube", code: "looks_like_dish", dish_guess: "Ramen" });
    mocks.inventRecipe.mockResolvedValue({ status: "full", platform: "youtube", recipe: { ...recipe, extraction_source: "invented" } });
    const { result } = renderHook(() => useSnap(), { wrapper });

    await act(() => result.current.run({ intent: "extract", source: url }));
    expect(result.current.offer).toEqual({ source: url, dishGuess: "Ramen", allowExtract: true });

    await act(async () => result.current.acceptOffer());
    await vi.waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/recipe/preview"));
    expect(mocks.inventRecipe).toHaveBeenCalledWith(expect.anything(), url.url, "he", { alreadyGated: true });
  });

  it("a partial import is free and isn't previewed", async () => {
    mocks.extractRecipe.mockResolvedValue({
      status: "partial",
      platform: "web",
      recipe: { ...recipe, instructions: [], extraction_status: "partial" },
      request_id: "req-2",
    });
    const { result } = renderHook(() => useSnap(), { wrapper });

    await act(() => result.current.run({ intent: "extract", source: { type: "url", url: "https://example.com/soup" } }));

    expect(result.current.banner).toMatchObject({ tone: "partial", title: "We couldn’t find the whole recipe" });
    expect(getSnapDraft()).toBeNull();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("sends a PDF as a PDF, and opens its recipe", async () => {
    mocks.extractRecipeFromPdf.mockResolvedValue({ status: "full", platform: "photo", recipe, request_id: "req-3" });
    const { result } = renderHook(() => useSnap(), { wrapper });

    await act(() => result.current.run({ intent: "extract", source: { type: "pdf", base64: "JVBERi0x", name: "cake.pdf" } }));

    expect(mocks.extractRecipeFromPdf).toHaveBeenCalledWith(expect.anything(), "JVBERi0x");
    expect(mocks.extractRecipeFromImage).not.toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledWith("/recipe/preview");
  });

  it("a PDF with no recipe says so in the app's words, and offers no guess", async () => {
    mocks.extractRecipeFromPdf.mockResolvedValue({
      status: "failed",
      platform: "photo",
      code: "pdf_no_recipe",
      message: "Couldn't find a recipe in this PDF.",
    });
    const { result } = renderHook(() => useSnap(), { wrapper });

    await act(() => result.current.run({ intent: "extract", source: { type: "pdf", base64: "JVBERi0x", name: "cake.pdf" } }));

    expect(result.current.offer).toBeNull();
    expect(result.current.banner).toEqual({ tone: "error", message: i18n.t("snap.pdfNotFound") });
  });

  it("a guess that throws says so", async () => {
    mocks.inventRecipeFromImage.mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useSnap(), { wrapper });

    await act(() => result.current.run({ intent: "invent", source: { type: "photo", base64: "abc", mimeType: "image/jpeg" } }));

    expect(result.current.banner).toEqual({ tone: "error", message: "Couldn’t invent a recipe from that. Try a clearer photo of the dish." });
  });
});
