import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { CheckoutError } from "@shared/lib/supabase/creditPurchases";
import type { ProfileQuota } from "@shared/lib/supabase/profile";

const mocks = vi.hoisted(() => ({
  quota: null as ProfileQuota | null,
  refresh: vi.fn(async () => {}),
  startCheckout: vi.fn(),
}));
vi.mock("@/lib/credits/balance", () => ({
  useCreditBalance: () => ({ quota: mocks.quota, loading: false, failed: false, refresh: mocks.refresh }),
}));
vi.mock("@/lib/credits/checkout", () => ({ startCheckout: mocks.startCheckout }));

import { OutOfCreditsDialog } from "@/components/credits/OutOfCreditsDialog";
import { addCreditsStrings } from "@/components/credits/testStrings";
import i18n from "@/lib/i18n";
import { resetSalesSwitch } from "@/lib/credits/salesSwitch";

function quota(free: number, purchased: number): ProfileQuota {
  return {
    subscriptionStatus: "free",
    subscriptionActive: false,
    freeExtractsUsed: 10 - free,
    freeExtractsRemaining: free,
    monthlyExtractsUsed: 10 - free,
    monthlyExtractsRemaining: null,
    extractsRemaining: free + purchased,
    purchasedCredits: purchased,
    totalCredits: free + purchased,
  };
}

function open(props: { needed?: number } = {}) {
  const onOpenChange = vi.fn();
  render(
    <I18nextProvider i18n={i18n}>
      <OutOfCreditsDialog open onOpenChange={onOpenChange} {...props} />
    </I18nextProvider>,
  );
  return { dialog: screen.getByRole("dialog"), onOpenChange };
}

beforeAll(addCreditsStrings);
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_CREDIT_PURCHASES_ENABLED", "true");
  resetSalesSwitch();
  mocks.quota = quota(0, 0);
  mocks.refresh.mockClear();
  mocks.startCheckout.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("OutOfCreditsDialog", () => {
  it("says they're out, shows the balance and the packs with prices, and reads the balance afresh", () => {
    const { dialog } = open();
    expect(screen.getByRole("dialog", { name: "You’re out of credits" })).toBeDefined();
    expect(within(dialog).getByText("0 credits available")).toBeDefined();
    expect(within(dialog).getByText(/wait for your 10 free credits on/)).toBeDefined();
    expect(within(dialog).getByRole("button", { name: "Buy 10 recipe credits for $1.99" })).toBeDefined();
    expect(within(dialog).getByRole("button", { name: "Buy 30 recipe credits for $4.99" })).toBeDefined();
    const best = within(dialog).getByRole("button", { name: "Buy 100 recipe credits for $7.99" });
    expect(within(best).getByText("Best value")).toBeDefined();
    expect(within(best).getByText("Save 59%")).toBeDefined();
    expect(within(best).getByText(/\$0\.08 per credit/)).toBeDefined();
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("buys a pack right there", async () => {
    mocks.startCheckout.mockReturnValue(new Promise(() => {}));
    const { dialog } = open();
    fireEvent.click(within(dialog).getByRole("button", { name: /Buy 30 recipe credits/ }));
    expect(mocks.startCheckout).toHaveBeenCalledWith("pinch_credits_30");
    expect(await within(dialog).findByText("Opening the secure checkout…")).toBeDefined();
    // One checkout at a time.
    expect((within(dialog).getByRole("button", { name: /Buy 10 recipe credits/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("says so when the checkout couldn't open, and lets them try again", async () => {
    mocks.startCheckout.mockRejectedValue(new CheckoutError("unavailable"));
    const { dialog } = open();
    fireEvent.click(within(dialog).getByRole("button", { name: /Buy 10 recipe credits/ }));
    expect((await within(dialog).findByRole("alert")).textContent).toContain("The purchase didn’t complete");
    expect((within(dialog).getByRole("button", { name: /Buy 10 recipe credits/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("says how many credits the action needs when they have some, but not enough", () => {
    mocks.quota = quota(1, 0);
    open({ needed: 2 });
    expect(screen.getByRole("dialog", { name: "This needs 2 credits" })).toBeDefined();
  });

  it("points to the app while web sales are off, without offering packs", () => {
    vi.stubEnv("NEXT_PUBLIC_CREDIT_PURCHASES_ENABLED", "false");
    const { dialog } = open();
    expect(within(dialog).getByText("Buy credits in the Pinch app")).toBeDefined();
    expect(within(dialog).getByRole("link", { name: /App Store/ }).getAttribute("href")).toContain("apps.apple.com");
    expect(within(dialog).getByRole("link", { name: /Google Play/ }).getAttribute("href")).toContain("play.google.com");
    expect(within(dialog).queryByRole("button", { name: /Buy 10/ })).toBeNull();
  });

  it("links to the credits page, closing the prompt", async () => {
    const { dialog, onOpenChange } = open();
    const link = within(dialog).getByRole("link", { name: /Credits and prices/ });
    expect(link.getAttribute("href")).toBe("/settings/credits");
    fireEvent.click(link);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});
