import { fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/lib/i18n";
import { addOnboardingStrings } from "@/lib/onboarding/testStrings";

const nav = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: nav.replace }) }));

const auth = vi.hoisted(() => ({ state: { user: null as null | { id: string }, loading: false as boolean, session: null } }));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => auth.state }));

const lang = vi.hoisted(() => ({ setLanguage: vi.fn(), ready: true }));
vi.mock("@/components/LanguageProvider", () => ({ useLanguage: () => ({ language: "en", setLanguage: lang.setLanguage, ready: lang.ready }) }));

import { WelcomeScreen } from "./WelcomeScreen";

function renderWelcome(search = "") {
  // `next` is read from the address bar itself, so the server can draw the page ahead of time (PIN-174).
  window.history.replaceState(null, "", `/welcome${search ? `?${search}` : ""}`);
  return render(
    <I18nextProvider i18n={i18n}>
      <WelcomeScreen />
    </I18nextProvider>,
  );
}

describe("WelcomeScreen", () => {
  beforeAll(() => addOnboardingStrings());
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    auth.state = { user: null, loading: false, session: null };
    lang.ready = true;
    document.documentElement.removeAttribute("data-welcome-wait");
  });

  it("leads with what Pinch saves, and two clear ways on", () => {
    renderWelcome();
    expect(screen.getByRole("heading", { level: 1, name: "Save any recipe in seconds. Cook it tonight." })).toBeDefined();
    expect(screen.getByRole("link", { name: /Get started free/ }).getAttribute("href")).toBe(
      "/auth?mode=signup&reason=welcome&next=%2Fonboarding",
    );
    expect(screen.getByRole("link", { name: "I already have an account" }).getAttribute("href")).toBe("/auth?mode=signin");
    expect(document.title).toBe("Welcome · Pinch");
  });

  it("keeps where the visitor was headed through sign-up and onboarding", () => {
    renderWelcome("next=%2Flist");
    expect(screen.getByRole("link", { name: /Get started free/ }).getAttribute("href")).toBe(
      `/auth?mode=signup&reason=welcome&next=${encodeURIComponent("/onboarding?next=%2Flist")}`,
    );
    expect(screen.getByRole("link", { name: "I already have an account" }).getAttribute("href")).toBe(
      "/auth?mode=signin&next=%2Flist",
    );
  });

  it("Get started remembers that onboarding is next, even if the email is confirmed in another tab", () => {
    renderWelcome();
    fireEvent.click(screen.getByRole("link", { name: /Get started free/ }));
    expect(window.localStorage.getItem("pinch:onboardingPending")).toBe("new");
  });

  it("offers every language by its own name, applied at once", () => {
    renderWelcome();
    const languages = screen.getByRole("group", { name: "Language" });
    expect(languages.textContent).toContain("עברית");
    expect(screen.getByRole("button", { name: "English" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "עברית" }));
    expect(lang.setLanguage).toHaveBeenCalledWith("he");
  });

  it("sends someone already signed in into the app", () => {
    auth.state = { user: { id: "u1" }, loading: false, session: null };
    renderWelcome("next=%2Fadd");
    expect(nav.replace).toHaveBeenCalledWith("/add");
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
  });

  it("is all there before the session has been read, as the server draws it (PIN-174)", () => {
    auth.state = { user: null, loading: true, session: null };
    renderWelcome();
    expect(screen.getByRole("heading", { level: 1, name: "Save any recipe in seconds. Cook it tonight." })).toBeDefined();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("shows itself once the visitor is known to be signed out and their language is in", () => {
    const root = document.documentElement;
    root.setAttribute("data-welcome-wait", "");
    auth.state = { user: null, loading: true, session: null };
    const view = renderWelcome();
    expect(root.hasAttribute("data-welcome-wait")).toBe(true);

    auth.state = { user: null, loading: false, session: null };
    lang.ready = false;
    view.rerender(
      <I18nextProvider i18n={i18n}>
        <WelcomeScreen />
      </I18nextProvider>,
    );
    expect(root.hasAttribute("data-welcome-wait")).toBe(true);

    lang.ready = true;
    view.rerender(
      <I18nextProvider i18n={i18n}>
        <WelcomeScreen />
      </I18nextProvider>,
    );
    expect(root.hasAttribute("data-welcome-wait")).toBe(false);
  });
});
