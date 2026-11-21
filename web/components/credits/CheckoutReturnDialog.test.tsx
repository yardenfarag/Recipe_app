import { fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { CheckoutReturnState } from "@/lib/credits/useCheckoutReturn";

const mocks = vi.hoisted(() => ({
  state: null as CheckoutReturnState,
  dismiss: vi.fn(),
  calls: 0,
}));
vi.mock("@/lib/credits/useCheckoutReturn", () => ({
  useCheckoutReturn: () => {
    mocks.calls += 1;
    return { state: mocks.state, dismiss: mocks.dismiss };
  },
}));
vi.mock("@/lib/credits/balance", () => ({
  useCreditBalance: () => ({
    quota: { totalCredits: 37, freeExtractsRemaining: 7, purchasedCredits: 30 },
    loading: false,
    failed: false,
    refresh: vi.fn(),
  }),
}));

import { CheckoutReturnDialog } from "@/components/credits/CheckoutReturnDialog";
import { addCreditsStrings } from "@/components/credits/testStrings";
import i18n from "@/lib/i18n";

function renderTwice() {
  return render(
    <I18nextProvider i18n={i18n}>
      <CheckoutReturnDialog />
      <CheckoutReturnDialog />
    </I18nextProvider>,
  );
}

beforeAll(addCreditsStrings);
beforeEach(() => {
  mocks.state = null;
  mocks.dismiss.mockReset();
  mocks.calls = 0;
});

describe("CheckoutReturnDialog", () => {
  it("shows nothing without a return from checkout", () => {
    renderTwice();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("runs once, however many times it is mounted", () => {
    mocks.state = { kind: "waiting" };
    renderTwice();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByText("Thanks! Adding your credits…")).toBeDefined();
  });

  it("says how many credits arrived, and the new balance", () => {
    mocks.state = { kind: "added", credits: 30 };
    renderTwice();
    expect(screen.getByRole("dialog", { name: "Payment received" })).toBeDefined();
    expect(screen.getByText("30 credits were added to your account.")).toBeDefined();
    expect(screen.getByText("37 credits available")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Great" }));
    expect(mocks.dismiss).toHaveBeenCalled();
  });

  it("offers support when the credits are slow to arrive", () => {
    mocks.state = { kind: "slow" };
    renderTwice();
    expect(screen.getByText(/can take a minute to show up/)).toBeDefined();
    expect(screen.getByRole("link", { name: "Contact support" }).getAttribute("href")).toBe("/settings/support");
  });
});
