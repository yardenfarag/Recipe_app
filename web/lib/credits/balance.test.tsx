import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetchProfile: vi.fn(), userId: "user-1" as string | null }));
vi.mock("@shared/lib/supabase/profile", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@shared/lib/supabase/profile")>()),
  fetchProfile: mocks.fetchProfile,
}));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => ({ user: mocks.userId ? { id: mocks.userId } : null }) }));
vi.mock("@/lib/supabase", () => ({ getSupabase: vi.fn() }));

import { refreshCredits, resetCreditBalance, useCreditBalance } from "@/lib/credits/balance";

function profile(id: string, tokenBalance: number, monthlyUsed = 0) {
  return {
    id,
    email: null,
    avatar_url: null,
    token_balance: tokenBalance,
    is_admin: false,
    token_pack_notify_at: null,
    subscription_status: "free" as const,
    subscription_expires_at: null,
    free_extracts_used: 0,
    monthly_extracts_used: monthlyUsed,
    contribute_to_hub: true,
  };
}

function Balance({ name }: { name: string }) {
  const { quota, loading } = useCreditBalance();
  return <p data-testid={name}>{loading ? "loading" : quota ? String(quota.totalCredits) : "none"}</p>;
}

beforeEach(() => {
  resetCreditBalance();
  mocks.fetchProfile.mockReset();
  mocks.userId = "user-1";
});

describe("useCreditBalance", () => {
  it("reads the balance once for everything that shows it", async () => {
    mocks.fetchProfile.mockResolvedValue(profile("user-1", 5, 3));
    render(
      <>
        <Balance name="menu" />
        <Balance name="page" />
      </>,
    );
    expect(screen.getByTestId("menu").textContent).toBe("loading");
    // 7 free left this month + 5 bought.
    await waitFor(() => expect(screen.getByTestId("menu").textContent).toBe("12"));
    expect(screen.getByTestId("page").textContent).toBe("12");
    expect(mocks.fetchProfile).toHaveBeenCalledTimes(1);
  });

  it("updates every balance on the page after refreshCredits()", async () => {
    mocks.fetchProfile.mockResolvedValue(profile("user-1", 0, 10));
    render(
      <>
        <Balance name="menu" />
        <Balance name="page" />
      </>,
    );
    await waitFor(() => expect(screen.getByTestId("menu").textContent).toBe("0"));
    mocks.fetchProfile.mockResolvedValue(profile("user-1", 30, 10));
    act(() => refreshCredits());
    await waitFor(() => expect(screen.getByTestId("menu").textContent).toBe("30"));
    expect(screen.getByTestId("page").textContent).toBe("30");
  });

  it("keeps the last balance when a later read fails", async () => {
    mocks.fetchProfile.mockResolvedValue(profile("user-1", 4, 10));
    render(<Balance name="menu" />);
    await waitFor(() => expect(screen.getByTestId("menu").textContent).toBe("4"));
    mocks.fetchProfile.mockRejectedValue(new Error("offline"));
    act(() => refreshCredits());
    await waitFor(() => expect(mocks.fetchProfile).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId("menu").textContent).toBe("4");
  });

  it("never shows another account's balance", async () => {
    mocks.fetchProfile.mockImplementation(async (id: string) => profile(id, id === "user-1" ? 1 : 2, 10));
    const view = render(<Balance name="menu" />);
    await waitFor(() => expect(screen.getByTestId("menu").textContent).toBe("1"));
    mocks.userId = "user-2";
    view.rerender(<Balance name="menu" />);
    expect(screen.getByTestId("menu").textContent).not.toBe("1");
    await waitFor(() => expect(screen.getByTestId("menu").textContent).toBe("2"));
  });
});
