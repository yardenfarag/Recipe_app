import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CheckoutError } from "@shared/lib/supabase/creditPurchases";

const mocks = vi.hoisted(() => ({ startCreditCheckout: vi.fn() }));
vi.mock("@shared/lib/supabase/creditPurchases", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@shared/lib/supabase/creditPurchases")>()),
  startCreditCheckout: mocks.startCreditCheckout,
}));
vi.mock("@/lib/supabase", () => ({ getSupabase: vi.fn() }));

import {
  markHandled,
  readCheckoutStarted,
  readPendingReturn,
  RETURN_GIVE_UP_MS,
  savePendingReturn,
  startCheckout,
  wasHandled,
} from "@/lib/credits/checkout";
import { resetSalesSwitch, webSalesOn } from "@/lib/credits/salesSwitch";

beforeEach(() => {
  mocks.startCreditCheckout.mockReset();
  window.sessionStorage.clear();
  resetSalesSwitch();
  window.history.replaceState(null, "", "/app/add?checkout_id=old");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("starting a checkout", () => {
  it("opens Polar's checkout, coming back to this page, and remembers when it started", async () => {
    vi.stubEnv("NEXT_PUBLIC_CREDIT_PURCHASES_ENABLED", "true");
    mocks.startCreditCheckout.mockResolvedValue("https://polar.sh/checkout/abc");
    const navigate = vi.fn();
    await startCheckout("pinch_credits_30", { now: () => 1_000, navigate });
    // An old checkout id never rides along to the next return.
    expect(mocks.startCreditCheckout).toHaveBeenCalledWith("pinch_credits_30", "http://localhost:3000/app/add");
    expect(navigate).toHaveBeenCalledWith("https://polar.sh/checkout/abc");
    expect(readCheckoutStarted()).toBe(1_000);
  });

  it("doesn't call the server while the build has web sales off", async () => {
    vi.stubEnv("NEXT_PUBLIC_CREDIT_PURCHASES_ENABLED", "false");
    await expect(startCheckout("pinch_credits_10", { navigate: vi.fn() })).rejects.toMatchObject({ reason: "sales_off" });
    expect(mocks.startCreditCheckout).not.toHaveBeenCalled();
  });

  it("turns the packs off for this visit when the server says sales are off", async () => {
    vi.stubEnv("NEXT_PUBLIC_CREDIT_PURCHASES_ENABLED", "true");
    mocks.startCreditCheckout.mockRejectedValue(new CheckoutError("sales_off"));
    const navigate = vi.fn();
    await expect(startCheckout("pinch_credits_10", { navigate })).rejects.toMatchObject({ reason: "sales_off" });
    expect(webSalesOn()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    expect(readCheckoutStarted()).toBeNull();
  });

  it("reports any other failure as unavailable, and keeps sales on", async () => {
    vi.stubEnv("NEXT_PUBLIC_CREDIT_PURCHASES_ENABLED", "true");
    mocks.startCreditCheckout.mockRejectedValue(new Error("offline"));
    await expect(startCheckout("pinch_credits_10", { navigate: vi.fn() })).rejects.toMatchObject({ reason: "unavailable" });
    expect(webSalesOn()).toBe(true);
  });
});

describe("a return waiting for its credits", () => {
  it("survives a reload, and is forgotten once too old", () => {
    const pending = { checkoutId: "chk_1", since: "2026-11-21T10:00:00.000Z", returnedAt: 50_000, quiet: false };
    savePendingReturn(pending);
    expect(readPendingReturn(60_000)).toEqual(pending);
    expect(readPendingReturn(50_000 + RETURN_GIVE_UP_MS + 1)).toBeNull();
    savePendingReturn(null);
    expect(readPendingReturn(60_000)).toBeNull();
  });

  it("ignores anything in storage that isn't a pending return", () => {
    window.sessionStorage.setItem("pinch.webCheckoutReturn", "{not json");
    expect(readPendingReturn()).toBeNull();
    window.sessionStorage.setItem("pinch.webCheckoutReturn", JSON.stringify({ checkoutId: 3 }));
    expect(readPendingReturn()).toBeNull();
  });

  it("remembers the last ten checkouts it answered", () => {
    for (let i = 0; i < 12; i++) markHandled(`chk_${i}`);
    expect(wasHandled("chk_11")).toBe(true);
    expect(wasHandled("chk_2")).toBe(true);
    expect(wasHandled("chk_1")).toBe(false);
  });
});
