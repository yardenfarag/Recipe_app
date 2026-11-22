import { fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/lib/i18n";
import { addOnboardingStrings } from "@/lib/onboarding/testStrings";

const nav = vi.hoisted(() => ({ replace: vi.fn(), search: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace }),
  useSearchParams: () => new URLSearchParams(nav.search),
}));

const auth = vi.hoisted(() => ({ state: { user: null as null | { id: string }, loading: false, session: null } }));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => auth.state }));

const lang = vi.hoisted(() => ({ setLanguage: vi.fn() }));
vi.mock("@/components/LanguageProvider", () => ({ useLanguage: () => ({ language: "en", setLanguage: lang.setLanguage }) }));

import { WelcomeScreen } from "./WelcomeScreen";

function renderWelcome(search = "") {
  nav.search = search;
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
});
