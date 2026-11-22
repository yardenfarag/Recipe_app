import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "@shared/i18n/locales/en";
import he from "@shared/i18n/locales/he";

import i18n, { changeLanguage } from "@/lib/i18n";
import { ShareSaveError, type SharedRecipeState } from "@/lib/share/useSharedRecipe";

import SharedRecipePage from "./page";

const push = vi.fn();
const replace = vi.fn();
let state: SharedRecipeState = { status: "loading" };
let search = "";
let user: { id: string } | null = { id: "u1" };

vi.mock("next/navigation", () => ({
  useParams: () => ({ token: "tok-1" }),
  useRouter: () => ({ push, replace }),
  usePathname: () => "/s/tok-1",
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => ({ user, session: null, loading: false }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/share/useSharedRecipe", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/share/useSharedRecipe")>()),
  useSharedRecipe: () => state,
}));
vi.mock("@/components/recipe/RecipeView", () => ({
  RecipeView: ({ back, actions }: { back?: { href: string; label: string } | null; actions: ReactNode }) => (
    <div>
      {back === null ? null : <a href={back?.href ?? "/"}>back</a>}
      {actions}
    </div>
  ),
}));

const ready = (overrides: Partial<Extract<SharedRecipeState, { status: "ready" }>> = {}): SharedRecipeState =>
  ({
    status: "ready",
    display: { title: "Shared Soup" },
    libraryRecipeId: null,
    save: vi.fn().mockResolvedValue({ recipeId: "recipe-9", alreadySaved: false }),
    ...overrides,
  }) as unknown as SharedRecipeState;

const renderPage = () =>
  render(
    <I18nextProvider i18n={i18n}>
      <SharedRecipePage />
    </I18nextProvider>,
  );

beforeEach(() => {
  push.mockReset();
  replace.mockReset();
  search = "";
  user = { id: "u1" };
});

describe("Shared recipe page for a guest", () => {
  it("shows the recipe without a way back into the app, and Save sends them to sign up and back with save=1", () => {
    user = null;
    state = ready();
    renderPage();
    expect(screen.getByText("Sign in or create a free account to save it.", { exact: false })).toBeDefined();
    expect(screen.queryByRole("link", { name: "back" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save to my kitchen" }));
    expect(push).toHaveBeenCalledWith(`/auth?mode=signup&next=${encodeURIComponent("/s/tok-1?save=1")}&reason=shared_recipe`);
  });

  it("back from signing in with save=1, saves it on its own, once, and opens the saved copy", async () => {
    search = "save=1";
    const dropSave = vi.spyOn(window.history, "replaceState");
    const save = vi.fn().mockResolvedValue({ recipeId: "recipe-9", alreadySaved: false });
    state = ready({ save });
    renderPage();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/recipe/recipe-9"));
    expect(save).toHaveBeenCalledOnce();
    // save=1 leaves the address through history, not a router navigation that could race the move on.
    expect(dropSave).toHaveBeenCalledOnce();
    expect(String(dropSave.mock.calls[0][2])).not.toContain("save=1");
  });
});

describe("Shared recipe page", () => {
  it("saves the recipe and opens the saved copy in its place", async () => {
    state = ready();
    renderPage();
    expect(document.title).toBe("Shared Soup · Pinch");
    fireEvent.click(screen.getByRole("button", { name: "Save to my kitchen" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/recipe/recipe-9"));
    expect(push).not.toHaveBeenCalled();
  });

  it("opens the saved copy when the cook already has it", () => {
    state = ready({ libraryRecipeId: "recipe-3" });
    renderPage();
    expect(screen.queryByRole("button", { name: "Save to my kitchen" })).toBeNull();
    expect(screen.getByRole("link", { name: "Open in library" }).getAttribute("href")).toBe("/recipe/recipe-3");
  });

  it("says so when saving fails, and stays on the page", async () => {
    state = ready({ save: vi.fn().mockRejectedValue(new ShareSaveError("Could not save shared recipe", "claim_failed")) });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Save to my kitchen" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Couldn’t save shared recipe");
    expect(alert.textContent).toContain("Please try again.");
    expect(replace).not.toHaveBeenCalled();
  });

  it("puts the server's code in the app's words", async () => {
    state = ready({ save: vi.fn().mockRejectedValue(new ShareSaveError("Could not load share", "share_unavailable")) });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Save to my kitchen" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining(en.serverErrors.shareUnavailable));
  });

  it("never shows a Hebrew reader the server's English (PIN-158)", async () => {
    await changeLanguage("he");
    try {
      state = ready({ save: vi.fn().mockRejectedValue(new ShareSaveError("Some new English failure", "brand_new_code")) });
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: he.recipe.shareSave }));
      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain(he.common.tryAgain);
      expect(alert.textContent).not.toContain("English");
    } finally {
      await changeLanguage("en");
    }
  });

  it("says the link stopped working when it is revoked while open", async () => {
    state = ready({ save: vi.fn().mockRejectedValue(new ShareSaveError("Share not found", "share_not_found")) });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Save to my kitchen" }));
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      expect.stringContaining("This share link is invalid or no longer available."),
    );
  });

  it("a link that no longer works says so plainly, with a way to the library", () => {
    state = { status: "missing" };
    renderPage();
    expect(screen.getByRole("heading", { name: "This share link is invalid or no longer available." })).toBeDefined();
    expect(screen.getByRole("link", { name: "Go to Library" }).getAttribute("href")).toBe("/");
    expect(document.title).toBe("Shared recipe · Pinch");
  });

  it("a guest on a dead link gets no library link", () => {
    user = null;
    state = { status: "missing" };
    renderPage();
    expect(screen.getByRole("heading", { name: "This share link is invalid or no longer available." })).toBeDefined();
    expect(screen.queryByRole("link", { name: "Go to Library" })).toBeNull();
  });

  it("a failed load offers to try again", () => {
    const reload = vi.fn();
    state = { status: "error", reload };
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reload).toHaveBeenCalledOnce();
  });
});
