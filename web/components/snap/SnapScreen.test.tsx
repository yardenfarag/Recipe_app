import { act, fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SnapScreen } from "@/components/snap/SnapScreen";
import i18n from "@/lib/i18n";
import { clearSnapDraft, setSnapDraft } from "@/lib/snap/draft";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  extractRecipe: vi.fn(),
  fetchRecipeByUrl: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, replace: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => ({ user: { id: "user-1" }, session: null, loading: false }) }));
vi.mock("@/components/LanguageProvider", () => ({ useLanguage: () => ({ language: "en", setLanguage: vi.fn() }) }));
vi.mock("@/lib/credits/balance", () => ({
  useCreditBalance: () => ({
    quota: { totalCredits: 12, freeExtractsRemaining: 7, purchasedCredits: 5 },
    refresh: vi.fn(async () => {}),
  }),
}));
vi.mock("@shared/lib/supabase/recipes", () => ({ fetchRecipeByUrl: mocks.fetchRecipeByUrl }));
vi.mock("@shared/lib/supabase/extractRecipe", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@shared/lib/supabase/extractRecipe")>()),
  extractRecipe: mocks.extractRecipe,
}));

const wrap = () => render(<I18nextProvider i18n={i18n}>{<SnapScreen />}</I18nextProvider>);
const linkField = () => screen.getByLabelText("Recipe URL") as HTMLInputElement;
const VIDEO = "https://www.youtube.com/watch?v=abc123def45";

function pasteText(target: EventTarget, text: string) {
  const event = new Event("paste", { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown };
  event.clipboardData = { files: [], getData: (type: string) => (type === "text/plain" ? text : "") };
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

describe("SnapScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    clearSnapDraft();
    mocks.fetchRecipeByUrl.mockResolvedValue(null);
  });

  it("shows the balance and what an import costs", () => {
    wrap();
    // Just the balance: how it splits into free and bought is on the credits page.
    expect(screen.getByText("12 credits available")).toBeDefined();
    expect(screen.queryByText(/ free \+ /)).toBeNull();
    expect(screen.getByText(/Use one credit for each successful Snap/)).toBeDefined();
  });

  it("asks for a real link instead of importing", () => {
    wrap();
    fireEvent.change(linkField(), { target: { value: "not a link" } });
    fireEvent.click(screen.getByRole("button", { name: "Snap" }));
    expect(screen.getByText(/Enter a valid recipe link/)).toBeDefined();
    expect(mocks.extractRecipe).not.toHaveBeenCalled();
  });

  it("a link pasted outside the field lands in it, without starting", () => {
    wrap();
    const event = pasteText(document.body, `Look at this ${VIDEO} !`);
    expect(event.defaultPrevented).toBe(true);
    expect(linkField().value).toBe(VIDEO);
    expect(mocks.extractRecipe).not.toHaveBeenCalled();
  });

  it("a paste into the field is left to the field", () => {
    wrap();
    const event = pasteText(linkField(), VIDEO);
    expect(event.defaultPrevented).toBe(false);
  });

  it("Guess the recipe changes the heading and the photo button", () => {
    wrap();
    fireEvent.click(screen.getByRole("radio", { name: "Guess the recipe" }));
    expect(screen.getByRole("heading", { level: 1, name: "Guess the recipe" })).toBeDefined();
    expect(screen.getByRole("button", { name: /Photo of a dish/ })).toBeDefined();
    expect(screen.getByLabelText("Food link")).toBeDefined();
  });

  it("offers to open a link that is already saved, and opens it instead of importing", async () => {
    mocks.fetchRecipeByUrl.mockResolvedValue({ id: "r7", title: "Soup" });
    wrap();
    fireEvent.change(linkField(), { target: { value: VIDEO } });
    const open = await screen.findByRole("link", { name: "Open in library" }, { timeout: 2000 });
    expect(open.getAttribute("href")).toBe("/recipe/r7");
    fireEvent.click(screen.getByRole("button", { name: "Snap" }));
    expect(mocks.push).toHaveBeenCalledWith("/recipe/r7");
    expect(mocks.extractRecipe).not.toHaveBeenCalled();
  });

  it("points back to an import that isn't saved yet", async () => {
    await setSnapDraft({ title: "Lemon Pasta", servings: 2, ingredients: [], instructions: [], extraction_status: "full" });
    wrap();
    expect(screen.getByRole("link", { name: "Preview" }).getAttribute("href")).toBe("/recipe/preview");
  });
});
