import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SnapPreview } from "@/components/snap/SnapPreview";
import i18n from "@/lib/i18n";
import { clearSnapDraft, getSnapDraft, setSnapDraft } from "@/lib/snap/draft";

const mocks = vi.hoisted(() => ({ replace: vi.fn(), save: vi.fn(), toast: vi.fn(), translate: vi.fn(), upsert: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: mocks.replace }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/LanguageProvider", () => ({ useLanguage: () => ({ language: "en", setLanguage: vi.fn() }) }));
vi.mock("@/lib/library/useCollections", () => ({ useCollections: () => ({ collections: [] }) }));
vi.mock("@/lib/recipe/useKitchenProfile", () => ({ useKitchenProfile: () => ({ profile: null }) }));
vi.mock("@shared/lib/supabase/saveRecipeDraft", () => ({ saveRecipeDraft: mocks.save }));
vi.mock("@shared/lib/toast", () => ({ showToast: mocks.toast }));
vi.mock("@shared/lib/ensureRecipeTranslation", () => ({ ensureRecipeTranslation: mocks.translate }));
vi.mock("@shared/lib/supabase/recipeTranslations", () => ({ upsertRecipeTranslation: mocks.upsert }));

const recipe = {
  title: "Lemon Pasta",
  servings: 2,
  original_url: "https://example.com/pasta",
  ingredients: [{ name: "spaghetti", quantity: 200, unit: "g" }],
  instructions: [{ step: 1, text: "Boil the pasta." }],
  extraction_status: "full" as const,
};

const wrap = () => render(<I18nextProvider i18n={i18n}>{<SnapPreview />}</I18nextProvider>);

describe("SnapPreview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    clearSnapDraft();
  });

  it("says there is nothing to preview without a draft", async () => {
    wrap();
    expect(await screen.findByText("Nothing to preview yet. Snap a recipe first.")).toBeDefined();
  });

  it("shows the recipe with Save, without a heart, and back to Snap", async () => {
    await setSnapDraft(recipe);
    wrap();
    expect(await screen.findByRole("heading", { level: 1, name: "Lemon Pasta" })).toBeDefined();
    expect(screen.getByText("Boil the pasta.")).toBeDefined();
    expect(screen.getByRole("button", { name: "Save recipe" })).toBeDefined();
    expect(screen.queryByRole("button", { name: /favorites/ })).toBeNull();
    // Its label is a new string ("Back to Snap"), so it is found by where it goes.
    expect(screen.getAllByRole("link").some((link) => link.getAttribute("href") === "/add")).toBe(true);
  });

  it("Save stores the recipe, forgets the draft and opens the Library's saved banner", async () => {
    mocks.save.mockResolvedValue({ recipe: { ...recipe, id: "r1" }, recoveredDuplicate: false });
    await setSnapDraft(recipe);
    wrap();
    fireEvent.click(await screen.findByRole("button", { name: "Save recipe" }));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/?saved=1"));
    expect(mocks.save).toHaveBeenCalledWith({ ...recipe, source_language: "en" });
    expect(getSnapDraft()).toBeNull();
  });

  it("a save that had already gone through opens the saved recipe", async () => {
    mocks.save.mockResolvedValue({ recipe: { ...recipe, id: "r2" }, recoveredDuplicate: true });
    await setSnapDraft(recipe);
    wrap();
    fireEvent.click(await screen.findByRole("button", { name: "Save recipe" }));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/recipe/r2"));
    expect(mocks.toast).toHaveBeenCalledWith("This link was already in your Library.", "info");
  });

  it("a failed save keeps the draft and says why", async () => {
    mocks.save.mockRejectedValue(new Error("offline"));
    await setSnapDraft(recipe);
    wrap();
    fireEvent.click(await screen.findByRole("button", { name: "Save recipe" }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalled());
    const [text, kind] = mocks.toast.mock.calls[0];
    expect(kind).toBe("error");
    expect(text).not.toContain("offline");
    expect(text).not.toContain(":");
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(getSnapDraft()?.recipe.title).toBe("Lemon Pasta");
  });

  describe("a recipe in another language", () => {
    const hebrew = {
      ...recipe,
      title: "פסטה לימון",
      source_language: "he",
      ingredients: [{ name: "ספגטי", quantity: 200, unit: "g" }],
      instructions: [{ step: 1, text: "מבשלים את הפסטה." }],
    };
    const english = {
      title: "Lemon Pasta",
      ingredients: [{ name: "spaghetti", quantity: 200, unit: "g" }],
      instructions: [{ step: 1, text: "Boil the pasta." }],
      translation_version: 2,
    };

    it("waits for the translation instead of showing the recipe's own words first", async () => {
      let finish: (value: unknown) => void = () => undefined;
      mocks.translate.mockReturnValue(new Promise((resolve) => (finish = resolve)));
      await setSnapDraft(hebrew);
      wrap();
      expect(await screen.findByText("Translating recipe…")).toBeDefined();
      expect(screen.queryByText("פסטה לימון")).toBeNull();
      expect(screen.queryByRole("button", { name: "Save recipe" })).toBeNull();

      finish({ status: "ok", content: english, fromCache: false });
      expect(await screen.findByRole("heading", { level: 1, name: "Lemon Pasta" })).toBeDefined();
      expect(screen.queryByText("Translating recipe…")).toBeNull();
    });

    it("Save stores the translation with the recipe, so it opens translated", async () => {
      mocks.translate.mockResolvedValue({ status: "ok", content: english, fromCache: false });
      mocks.upsert.mockResolvedValue(undefined);
      mocks.save.mockResolvedValue({ recipe: { ...hebrew, id: "r3" }, recoveredDuplicate: false });
      await setSnapDraft(hebrew);
      wrap();
      fireEvent.click(await screen.findByRole("button", { name: "Save recipe" }));
      await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/?saved=1"));
      expect(mocks.save).toHaveBeenCalledWith(hebrew);
      expect(mocks.upsert).toHaveBeenCalledWith("r3", "en", expect.objectContaining({ title: "Lemon Pasta" }));
    });

    it("still saves when the translation can't be stored", async () => {
      mocks.translate.mockResolvedValue({ status: "ok", content: english, fromCache: false });
      mocks.upsert.mockRejectedValue(new Error("offline"));
      mocks.save.mockResolvedValue({ recipe: { ...hebrew, id: "r4" }, recoveredDuplicate: false });
      await setSnapDraft(hebrew);
      wrap();
      fireEvent.click(await screen.findByRole("button", { name: "Save recipe" }));
      await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/?saved=1"));
      expect(mocks.toast).not.toHaveBeenCalled();
    });

    it("shows the recipe's own words and says why when translating fails", async () => {
      mocks.translate.mockResolvedValue({ status: "failed", code: "translation_timeout", message: "Translation timed out." });
      await setSnapDraft(hebrew);
      wrap();
      expect(await screen.findByRole("heading", { level: 1, name: "פסטה לימון" })).toBeDefined();
      await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.any(String), "error"));
      fireEvent.click(screen.getByRole("button", { name: "Save recipe" }));
      await waitFor(() => expect(mocks.save).toHaveBeenCalled());
      expect(mocks.upsert).not.toHaveBeenCalled();
    });
  });
});
