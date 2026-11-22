import { fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/lib/i18n";

vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1", email: "cook@example.com" }, loading: false, session: null }),
}));
vi.mock("@/components/ThemeProvider", () => ({
  useTheme: () => ({ preference: "system", scheme: "light", pack: "mist", setPreference: vi.fn(), setPack: vi.fn() }),
}));
vi.mock("@/components/LanguageProvider", () => ({ useLanguage: () => ({ language: "en", setLanguage: vi.fn() }) }));
vi.mock("@/lib/auth", () => ({ signOut: vi.fn() }));
vi.mock("@/lib/credits/balance", () => ({ useCreditBalance: () => ({ quota: null, loading: false }) }));
vi.mock("@/components/credits/CheckoutReturnDialog", () => ({ CheckoutReturnDialog: () => null }));
const admin = vi.hoisted(() => ({ value: { isAdmin: false, loading: false } }));
vi.mock("@/lib/admin/useIsAdmin", () => ({ useIsAdmin: () => admin.value }));

import { AccountMenu } from "./AccountMenu";

function openMenu() {
  render(
    <I18nextProvider i18n={i18n}>
      <AccountMenu variant="full" />
    </I18nextProvider>,
  );
  fireEvent.keyDown(screen.getByRole("button", { name: "Account, theme and language" }), { key: "Enter" });
}

beforeEach(() => {
  admin.value = { isAdmin: false, loading: false };
});

describe("AccountMenu admin item", () => {
  it("leads admins to the admin pages", async () => {
    admin.value = { isAdmin: true, loading: false };
    openMenu();
    const item = await screen.findByRole("menuitem", { name: "Admin" });
    expect(item.getAttribute("href")).toBe("/admin/dashboard");
  });

  it("isn't there for anyone else", async () => {
    openMenu();
    expect(await screen.findByRole("menuitem", { name: "Settings" })).toBeDefined();
    expect(screen.queryByRole("menuitem", { name: "Admin" })).toBeNull();
  });
});
