import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsFrame } from "@/components/settings/SettingsFrame";
import { addSettingsStrings } from "@/components/settings/testStrings";
import i18n from "@/lib/i18n";

const state = vi.hoisted(() => ({ path: "/settings", wide: true, isAdmin: false }));

vi.mock("next/navigation", () => ({ usePathname: () => state.path }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/settings/useWideLayout", () => ({ useWideLayout: () => state.wide }));
vi.mock("@/lib/settings/useProfile", () => ({
  useProfile: () => ({ avatarUrl: null, totalCredits: 12, isAdmin: state.isAdmin, loading: false, refresh: vi.fn() }),
}));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => ({ user: { id: "u1", email: "cook@example.com" }, loading: false }) }));
vi.mock("@/components/LanguageProvider", () => ({ useLanguage: () => ({ language: "en", setLanguage: vi.fn() }) }));
vi.mock("@/components/ThemeProvider", () => ({ useTheme: () => ({ preference: "system", pack: "mist", setPreference: vi.fn(), setPack: vi.fn() }) }));

beforeAll(addSettingsStrings);
beforeEach(() => {
  state.path = "/settings";
  state.wide = true;
  state.isAdmin = false;
});

const show = () =>
  render(
    <I18nextProvider i18n={i18n}>
      <SettingsFrame>
        <h1>Page content</h1>
      </SettingsFrame>
    </I18nextProvider>,
  );

describe("SettingsFrame on a desktop", () => {
  it("shows the menu beside the page, with the open page marked", () => {
    state.path = "/settings/appearance";
    show();
    const menu = screen.getByRole("navigation", { name: "Settings" });
    expect(screen.getByRole("heading", { level: 1, name: "Page content" })).toBeDefined();
    expect(menu.querySelector('[aria-current="page"]')?.textContent).toBe("Appearance");
    expect(screen.getByRole("link", { name: "Recipe preferences" }).getAttribute("href")).toBe("/settings/recipe");
    expect(screen.getByRole("link", { name: "Credits" }).getAttribute("href")).toBe("/settings/credits");
  });

  it("opens Account on the settings home", () => {
    show();
    expect(screen.getByRole("link", { name: "Account" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByText("Page content")).toBeDefined();
  });

  it("shows the way to the admin pages to admins only", () => {
    show();
    expect(screen.queryByRole("link", { name: "Admin" })).toBeNull();
  });
});

describe("SettingsFrame on a phone", () => {
  beforeEach(() => {
    state.wide = false;
  });

  it("shows the menu on the settings home, with current choices", () => {
    show();
    expect(screen.getByRole("heading", { level: 1, name: "Settings" })).toBeDefined();
    expect(screen.queryByText("Page content")).toBeNull();
    expect(screen.getByRole("link", { name: /cook@example\.com/ }).getAttribute("href")).toBe("/settings/account");
    expect(screen.getByRole("link", { name: /Appearance.*Auto · Mist Drift/ })).toBeDefined();
    expect(screen.getByRole("link", { name: /Credits.*12 credits available/ })).toBeDefined();
  });

  it("shows a page on its own, with a way back", () => {
    state.path = "/settings/language";
    show();
    expect(screen.getByText("Page content")).toBeDefined();
    expect(screen.getByRole("link", { name: "Settings" }).getAttribute("href")).toBe("/settings");
    expect(screen.queryByRole("navigation", { name: "Settings" })).toBeNull();
  });

  it("has one row into the admin pages for an admin", () => {
    state.isAdmin = true;
    show();
    expect(screen.getByRole("link", { name: /^Admin/ }).getAttribute("href")).toBe("/admin/dashboard");
    expect(screen.queryByRole("link", { name: "Insights" })).toBeNull();
  });
});
