import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetchAvatarValue: vi.fn(), user: { id: "u1" } as { id: string } | null }));
vi.mock("@shared/lib/supabase/profile", () => ({ fetchAvatarValue: mocks.fetchAvatarValue }));
vi.mock("@/lib/supabase", () => ({ getSupabase: () => ({}) }));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => ({ user: mocks.user }) }));

import { announceAvatar, forgetAvatars, useAvatar } from "./useAvatar";

beforeEach(() => {
  forgetAvatars();
  mocks.fetchAvatarValue.mockReset();
  mocks.user = { id: "u1" };
});

describe("useAvatar", () => {
  it("reads the picture once, however many avatars are drawn", async () => {
    mocks.fetchAvatarValue.mockResolvedValue("food:pizza");
    const first = renderHook(() => useAvatar());
    const second = renderHook(() => useAvatar());
    await waitFor(() => expect(first.result.current).toBe("food:pizza"));
    expect(second.result.current).toBe("food:pizza");
    expect(mocks.fetchAvatarValue).toHaveBeenCalledTimes(1);
  });

  it("follows a change made in Settings", async () => {
    mocks.fetchAvatarValue.mockResolvedValue(null);
    const { result } = renderHook(() => useAvatar());
    await waitFor(() => expect(mocks.fetchAvatarValue).toHaveBeenCalled());
    act(() => announceAvatar("u1", "food:taco"));
    expect(result.current).toBe("food:taco");
  });

  it("keeps a change announced while the first read was still out", async () => {
    let finish: (value: string | null) => void = () => {};
    mocks.fetchAvatarValue.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { result } = renderHook(() => useAvatar());
    act(() => announceAvatar("u1", "food:egg"));
    await act(async () => finish("https://example.com/old.jpg"));
    expect(result.current).toBe("food:egg");
  });

  it("shows nothing when the read fails, and never another account's picture", async () => {
    mocks.fetchAvatarValue.mockRejectedValue(new Error("offline"));
    const { result, rerender } = renderHook(() => useAvatar());
    await waitFor(() => expect(mocks.fetchAvatarValue).toHaveBeenCalled());
    expect(result.current).toBeNull();

    act(() => announceAvatar("u2", "food:donut"));
    expect(result.current).toBeNull();
    mocks.user = null;
    rerender();
    expect(result.current).toBeNull();
  });
});
