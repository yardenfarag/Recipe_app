import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetchProfile: vi.fn(), user: { id: "u1" } as { id: string } | null }));
vi.mock("@shared/lib/supabase/profile", () => ({ fetchProfile: mocks.fetchProfile }));
vi.mock("@/lib/supabase", () => ({ getSupabase: () => ({}) }));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => ({ user: mocks.user }) }));

import { forgetIsAdmin, readIsAdmin, useIsAdmin } from "./useIsAdmin";

beforeEach(() => {
  forgetIsAdmin();
  mocks.fetchProfile.mockReset();
  mocks.user = { id: "u1" };
});

describe("useIsAdmin", () => {
  it("is true only for a profile with is_admin", async () => {
    mocks.fetchProfile.mockResolvedValue({ is_admin: true });
    const { result } = renderHook(() => useIsAdmin());
    expect(result.current).toEqual({ isAdmin: false, loading: true });
    await waitFor(() => expect(result.current).toEqual({ isAdmin: true, loading: false }));
  });

  it("is false when the profile says no, or can't be read", async () => {
    mocks.fetchProfile.mockResolvedValue({ is_admin: false });
    const first = renderHook(() => useIsAdmin());
    await waitFor(() => expect(first.result.current).toEqual({ isAdmin: false, loading: false }));

    forgetIsAdmin();
    mocks.fetchProfile.mockRejectedValue(new Error("offline"));
    const second = renderHook(() => useIsAdmin());
    await waitFor(() => expect(second.result.current).toEqual({ isAdmin: false, loading: false }));
  });

  it("reads once per account, and tries again after a failure", async () => {
    mocks.fetchProfile.mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ is_admin: true });
    await expect(readIsAdmin("u1")).rejects.toThrow("offline");
    await expect(readIsAdmin("u1")).resolves.toBe(true);
    await expect(readIsAdmin("u1")).resolves.toBe(true);
    expect(mocks.fetchProfile).toHaveBeenCalledTimes(2);
  });
});
