import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

import en from "@shared/i18n/locales/en";
import { FREE_MONTHLY_EXTRACT_LIMIT } from "@shared/lib/quotas";

import i18n from "@/lib/i18n";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1", email: "cook@example.com" }, loading: false, session: null }),
}));
vi.mock("@/lib/auth", () => ({ signOut: vi.fn() }));

import Home from "./page";

function renderHome() {
  return render(
    <I18nextProvider i18n={i18n}>
      <Home />
    </I18nextProvider>,
  );
}

describe("signed-in home placeholder", () => {
  it("shows the Pinch heading and who is signed in", () => {
    renderHome();
    expect(screen.getByRole("heading", { level: 1, name: "Pinch" })).toBeDefined();
    expect(screen.getByTestId("signed-in-email").textContent).toBe("cook@example.com");
    expect(screen.getByRole("button", { name: en.settings.signOut })).toBeDefined();
  });

  it("shows a string from the app's shared language files", () => {
    renderHome();
    expect(screen.getByText(en.onboarding.welcomeTitle)).toBeDefined();
  });

  it("fills a translated string with a number from shared logic", () => {
    renderHome();
    expect(
      screen.getByText(`You get ${FREE_MONTHLY_EXTRACT_LIMIT} free credits at the start of each month.`),
    ).toBeDefined();
  });
});
