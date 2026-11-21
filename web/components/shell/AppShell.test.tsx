import { render, screen, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/lib/i18n";

const nav = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1", email: "cook@example.com" }, loading: false, session: null }),
}));
vi.mock("@/components/ThemeProvider", () => ({
  useTheme: () => ({ preference: "system", scheme: "light", pack: "mist", setPreference: vi.fn(), setPack: vi.fn() }),
}));
vi.mock("@/components/LanguageProvider", () => ({ useLanguage: () => ({ language: "en", setLanguage: vi.fn() }) }));
vi.mock("@/lib/auth", () => ({ signOut: vi.fn() }));

import { TooltipProvider } from "@/components/ui/Tooltip";

import { AppShell } from "./AppShell";

function renderShell() {
  return render(
    <I18nextProvider i18n={i18n}>
      <TooltipProvider>
        <AppShell>
          <h1>Page</h1>
        </AppShell>
      </TooltipProvider>
    </I18nextProvider>,
  );
}

describe("AppShell", () => {
  beforeEach(() => {
    nav.pathname = "/";
  });

  it("starts with a skip link to the page content", () => {
    renderShell();
    const skip = screen.getByRole("link", { name: "Skip to content" });
    expect(skip.getAttribute("href")).toBe("#main");
    expect(document.getElementById("main")?.tagName).toBe("MAIN");
  });

  it("links to all five sections with real links, side and bottom", () => {
    renderShell();
    const [side, bottom] = screen.getAllByRole("navigation", { name: "Main" });
    for (const region of [side, bottom]) {
      const hrefs = within(region)
        .getAllByRole("link")
        .map((link) => link.getAttribute("href"));
      expect(new Set(hrefs)).toEqual(new Set(["/", "/hub", "/add", "/list", "/settings"]));
    }
  });

  it("marks the current section", () => {
    nav.pathname = "/hub";
    renderShell();
    const current = screen.getAllByRole("link", { current: "page" });
    expect(current.length).toBeGreaterThan(0);
    for (const link of current) expect(link.getAttribute("href")).toBe("/hub");
  });

  it("offers the account menu with who is signed in", () => {
    renderShell();
    expect(screen.getAllByRole("button", { name: "Account, theme and language" }).length).toBeGreaterThan(0);
    expect(screen.getByText("cook@example.com")).toBeDefined();
  });
});
