import { render, screen, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/credits/balance", () => ({
  useCreditBalance: () => ({
    quota: {
      subscriptionStatus: "free",
      subscriptionActive: false,
      freeExtractsUsed: 3,
      freeExtractsRemaining: 7,
      monthlyExtractsUsed: 3,
      monthlyExtractsRemaining: null,
      extractsRemaining: 23,
      purchasedCredits: 16,
      totalCredits: 23,
    },
    loading: false,
    failed: false,
    refresh: vi.fn(),
  }),
}));
vi.mock("@/lib/credits/checkout", () => ({ startCheckout: vi.fn() }));

import { addCreditsStrings } from "@/components/credits/testStrings";
import { CreditsSettings } from "@/components/settings/CreditsSettings";
import { resetSalesSwitch } from "@/lib/credits/salesSwitch";
import i18n from "@/lib/i18n";

function renderPage() {
  return render(
    <I18nextProvider i18n={i18n}>
      <CreditsSettings />
    </I18nextProvider>,
  );
}

beforeAll(addCreditsStrings);
beforeEach(() => {
  resetSalesSwitch();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("CreditsSettings", () => {
  it("shows the balance, where it comes from, and when the free credits come back", () => {
    vi.stubEnv("NEXT_PUBLIC_CREDIT_PURCHASES_ENABLED", "true");
    renderPage();
    const balance = screen.getByRole("region", { name: "Credits available" });
    expect(within(balance).getByText("23")).toBeDefined();
    expect(within(balance).getByText("7 of 10 left")).toBeDefined();
    expect(within(balance).getByText(/^Back to 10 on /)).toBeDefined();
    expect(within(balance).getByText("16")).toBeDefined();
    expect(within(balance).getByText("Never expire")).toBeDefined();
  });

  it("sells the three packs, and says what costs a credit and what's free", () => {
    vi.stubEnv("NEXT_PUBLIC_CREDIT_PURCHASES_ENABLED", "true");
    renderPage();
    const buy = screen.getByRole("region", { name: "Buy recipe credits" });
    expect(within(buy).getAllByRole("button", { name: /^Buy \d+ recipe credits for \$/ })).toHaveLength(3);
    const costs = screen.getByRole("region", { name: "What uses credits" });
    expect(within(costs).getAllByText("1 credit")).toHaveLength(3);
    expect(within(costs).getByText("Remixing a recipe, up to 5 times each")).toBeDefined();
  });

  it("points to the app instead while web sales are off", () => {
    vi.stubEnv("NEXT_PUBLIC_CREDIT_PURCHASES_ENABLED", "false");
    renderPage();
    const buy = screen.getByRole("region", { name: "Buy recipe credits" });
    expect(within(buy).queryAllByRole("button", { name: /^Buy / })).toHaveLength(0);
    expect(within(buy).getByText("Buy credits in the Pinch app")).toBeDefined();
  });
});
