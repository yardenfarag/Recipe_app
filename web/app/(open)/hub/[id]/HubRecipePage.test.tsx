import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/lib/i18n";
import type { HubRecipeState } from "@/lib/hub/useHubRecipe";

import HubRecipePage from "./page";

const push = vi.fn();
let state: HubRecipeState = { status: "loading" };

const replace = vi.fn();
let search = "";
let user: { id: string } | null = { id: "u1" };
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "card-1" }),
  useRouter: () => ({ push, replace }),
  usePathname: () => "/hub/card-1",
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
vi.mock("@/lib/hub/useHubRecipe", () => ({ useHubRecipe: () => state }));
vi.mock("@/components/recipe/RecipeView", () => ({
  RecipeView: ({ back, actions }: { back: { href: string; label: string } | null; actions: ReactNode }) => (
    <div>
      {back ? <a href={back.href}>{back.label}</a> : null}
      {actions}
    </div>
  ),
}));

const ready = (overrides: Partial<Extract<HubRecipeState, { status: "ready" }>> = {}): HubRecipeState =>
  ({
    status: "ready",
    card: { id: "card-1" },
    display: { title: "Hub Soup" },
    libraryRecipeId: null,
    addToLibrary: vi.fn().mockResolvedValue("recipe-9"),
    ...overrides,
  }) as unknown as HubRecipeState;

const renderPage = () =>
  render(
    <I18nextProvider i18n={i18n}>
      <HubRecipePage />
    </I18nextProvider>,
  );

beforeEach(() => {
  push.mockReset();
  replace.mockReset();
  search = "";
  user = { id: "u1" };
  window.sessionStorage.clear();
});

describe("Hub recipe page for a guest", () => {
  it("shows the recipe, says saving needs an account, and Add sends them to sign in and back with save=1", () => {
    user = null;
    state = ready();
    renderPage();
    expect(screen.getByText("Sign in or create a free account to save it.", { exact: false })).toBeDefined();
    expect(screen.queryByRole("link", { name: "Back to Hub" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add to Library" }));
    expect(push).toHaveBeenCalledWith(`/auth?mode=signin&next=${encodeURIComponent("/hub/card-1?save=1")}`);
  });

  it("back from signing in with save=1, adds it on its own, once", async () => {
    search = "save=1";
    const dropSave = vi.spyOn(window.history, "replaceState");
    const addToLibrary = vi.fn().mockResolvedValue("recipe-9");
    state = ready({ addToLibrary });
    renderPage();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/recipe/recipe-9"));
    expect(addToLibrary).toHaveBeenCalledOnce();
    // save=1 leaves the address through history, not a router navigation that could race the move on.
    expect(dropSave).toHaveBeenCalledOnce();
    expect(String(dropSave.mock.calls[0][2])).not.toContain("save=1");
  });
});

describe("Hub recipe page", () => {
  it("adds the recipe to the library and opens it", async () => {
    state = ready();
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Add to Library" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/recipe/recipe-9"));
    expect(document.title).toBe("Hub Soup · Pinch");
  });

  it("opens the saved copy when the cook already has it", () => {
    state = ready({ libraryRecipeId: "recipe-3" });
    renderPage();
    expect(screen.queryByRole("button", { name: "Add to Library" })).toBeNull();
    expect(screen.getByRole("link", { name: "Open in Library" }).getAttribute("href")).toBe("/recipe/recipe-3");
  });

  it("says so when adding fails, and stays on the page", async () => {
    state = ready({ addToLibrary: vi.fn().mockRejectedValue(new Error("card_not_found")) });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Add to Library" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("Couldn’t add recipe"));
    expect(push).not.toHaveBeenCalled();
  });

  it("Back to Hub returns to the list's last filters", () => {
    window.sessionStorage.setItem("pinch:hubListQuery", "?q=soup");
    state = ready();
    renderPage();
    expect(screen.getByRole("link", { name: "Back to Hub" }).getAttribute("href")).toBe("/hub?q=soup");
  });

  it("a recipe that left the Hub says so, with a way back", () => {
    state = { status: "missing" };
    renderPage();
    expect(screen.getByRole("heading", { name: "This Hub recipe is no longer available." })).toBeDefined();
    expect(screen.getByRole("link", { name: "Back to Hub" }).getAttribute("href")).toBe("/hub");
  });
});
