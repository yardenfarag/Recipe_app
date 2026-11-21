import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ purchasedCreditsSince: vi.fn(), refreshCredits: vi.fn() }));
vi.mock("@shared/lib/supabase/creditPurchases", () => ({ purchasedCreditsSince: mocks.purchasedCreditsSince }));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/lib/credits/balance", () => ({ refreshCredits: mocks.refreshCredits }));
vi.mock("@/lib/supabase", () => ({ getSupabase: vi.fn() }));

import { markHandled, readPendingReturn } from "@/lib/credits/checkout";
import { pollDelay, SLOW_AFTER_MS, useCheckoutReturn } from "@/lib/credits/useCheckoutReturn";

const NOW = Date.parse("2026-11-21T10:00:00Z");

function mount(onQuietlyAdded = vi.fn()) {
  const view = renderHook(() => useCheckoutReturn({ enabled: true, onQuietlyAdded }));
  return { ...view, onQuietlyAdded };
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  vi.setSystemTime(NOW);
  window.sessionStorage.clear();
  mocks.purchasedCreditsSince.mockReset();
  mocks.refreshCredits.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("pollDelay", () => {
  it("checks often at first, less once it's slow, then stops", () => {
    expect(pollDelay(0)).toBe(2_000);
    expect(pollDelay(SLOW_AFTER_MS)).toBe(5_000);
    expect(pollDelay(11 * 60_000)).toBeNull();
  });
});

describe("useCheckoutReturn", () => {
  it("does nothing on an ordinary visit, or after a cancelled checkout", async () => {
    window.history.replaceState(null, "", "/app/settings/credits");
    const { result } = mount();
    await advance(5_000);
    expect(result.current.state).toBeNull();
    expect(mocks.purchasedCreditsSince).not.toHaveBeenCalled();
  });

  it("waits for the webhook, then says how many credits arrived and refreshes the balance", async () => {
    window.sessionStorage.setItem("pinch.webCheckoutStartedAt", String(NOW - 120_000));
    window.history.replaceState(null, "", "/app/add?checkout_id=chk_1");
    mocks.purchasedCreditsSince.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValue(30);
    const { result } = mount();

    expect(result.current.state).toEqual({ kind: "waiting" });
    // The address loses the checkout id, so a reload or a copied link doesn't start this again.
    expect(window.location.search).toBe("");
    await advance(0);
    expect(mocks.purchasedCreditsSince).toHaveBeenCalledWith("user-1", "2026-11-21T09:57:00.000Z");
    await advance(4_000);
    expect(result.current.state).toEqual({ kind: "added", credits: 30 });
    expect(mocks.refreshCredits).toHaveBeenCalledTimes(1);
    expect(readPendingReturn()).toBeNull();
  });

  it("keeps waiting after a reload in the middle", async () => {
    window.history.replaceState(null, "", "/app/add?checkout_id=chk_2");
    mocks.purchasedCreditsSince.mockResolvedValue(null);
    const first = mount();
    await advance(0);
    first.unmount();

    // The reloaded page has no checkout id any more, only what this tab remembered.
    expect(window.location.search).toBe("");
    mocks.purchasedCreditsSince.mockResolvedValue(10);
    const second = mount();
    expect(second.result.current.state).toEqual({ kind: "waiting" });
    await advance(0);
    expect(second.result.current.state).toEqual({ kind: "added", credits: 10 });
  });

  it("says the credits are on their way when the webhook is slow, and still catches them", async () => {
    window.history.replaceState(null, "", "/app/add?checkout_id=chk_3");
    mocks.purchasedCreditsSince.mockResolvedValue(null);
    const { result } = mount();
    await advance(SLOW_AFTER_MS + 2_000);
    expect(result.current.state).toEqual({ kind: "slow" });

    mocks.purchasedCreditsSince.mockResolvedValue(100);
    await advance(5_000);
    expect(result.current.state).toEqual({ kind: "added", credits: 100 });
  });

  it("after the dialog is closed, keeps checking and reports quietly", async () => {
    window.history.replaceState(null, "", "/app/add?checkout_id=chk_4");
    mocks.purchasedCreditsSince.mockResolvedValue(null);
    const { result, onQuietlyAdded } = mount();
    await advance(0);
    act(() => result.current.dismiss());
    expect(result.current.state).toBeNull();

    mocks.purchasedCreditsSince.mockResolvedValue(30);
    await advance(2_000);
    expect(result.current.state).toBeNull();
    expect(onQuietlyAdded).toHaveBeenCalledWith(30);
    expect(mocks.refreshCredits).toHaveBeenCalled();
  });

  it("doesn't announce a checkout it already answered", async () => {
    markHandled("chk_5");
    window.history.replaceState(null, "", "/app/add?checkout_id=chk_5");
    const { result } = mount();
    await advance(2_000);
    expect(result.current.state).toBeNull();
    expect(mocks.purchasedCreditsSince).not.toHaveBeenCalled();
  });

  it("stops asking after ten minutes", async () => {
    window.history.replaceState(null, "", "/app/add?checkout_id=chk_6");
    mocks.purchasedCreditsSince.mockResolvedValue(null);
    mount();
    await advance(11 * 60_000);
    const calls = mocks.purchasedCreditsSince.mock.calls.length;
    await advance(60_000);
    expect(mocks.purchasedCreditsSince.mock.calls.length).toBe(calls);
    expect(readPendingReturn()).toBeNull();
  });
});
