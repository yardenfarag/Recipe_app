import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EMPTY_KITCHEN_PROFILE, type KitchenProfile } from "@shared/lib/kitchenProfile";

import { useKitchenSettings } from "@/lib/settings/useKitchenSettings";

const mocks = vi.hoisted(() => ({
  fetchCloudKitchenProfile: vi.fn(),
  saveCloudKitchenProfile: vi.fn(),
  fetchContributeToHub: vi.fn(),
  setContributeToHub: vi.fn(),
}));

vi.mock("@shared/lib/supabase/kitchen", () => ({
  fetchCloudKitchenProfile: mocks.fetchCloudKitchenProfile,
  saveCloudKitchenProfile: mocks.saveCloudKitchenProfile,
}));
vi.mock("@shared/lib/supabase/cookingHub", () => ({
  fetchContributeToHub: mocks.fetchContributeToHub,
  setContributeToHub: mocks.setContributeToHub,
}));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => ({ user: { id: "u1" }, loading: false }) }));

const withDiet = (diet: KitchenProfile["diets"][number]): KitchenProfile => ({ ...EMPTY_KITCHEN_PROFILE, diets: [diet] });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchCloudKitchenProfile.mockResolvedValue(EMPTY_KITCHEN_PROFILE);
  mocks.fetchContributeToHub.mockResolvedValue(false);
  mocks.saveCloudKitchenProfile.mockResolvedValue(undefined);
  mocks.setContributeToHub.mockResolvedValue(undefined);
});

describe("useKitchenSettings", () => {
  it("loads the account's profile and Hub choice", async () => {
    const { result } = renderHook(() => useKitchenSettings());
    await waitFor(() => expect(result.current.profile).toEqual(EMPTY_KITCHEN_PROFILE));
    expect(result.current.contributeToHub).toBe(false);
    expect(mocks.fetchCloudKitchenProfile).toHaveBeenCalledWith("u1");
  });

  it("saves changes in order, skipping ones a later change replaced", async () => {
    let finishFirst: () => void = () => {};
    mocks.saveCloudKitchenProfile.mockImplementationOnce(() => new Promise<void>((resolve) => (finishFirst = resolve)));
    const { result } = renderHook(() => useKitchenSettings());
    await waitFor(() => expect(result.current.profile).not.toBeNull());

    act(() => result.current.save(withDiet("vegan")));
    act(() => result.current.save(withDiet("keto")));
    act(() => result.current.save(withDiet("paleo")));
    expect(result.current.profile?.diets).toEqual(["paleo"]);
    expect(result.current.status).toBe("saving");

    await act(async () => finishFirst());
    await waitFor(() => expect(result.current.status).toBe("saved"));
    expect(mocks.saveCloudKitchenProfile.mock.calls.map((call) => (call[1] as KitchenProfile).diets)).toEqual([["vegan"], ["paleo"]]);
  });

  it("shows nothing to edit, and saves nothing, when the profile can't be read", async () => {
    mocks.fetchCloudKitchenProfile.mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useKitchenSettings());
    await waitFor(() => expect(result.current.loadFailed).toBe(true));
    expect(result.current.profile).toBeNull();
    expect(mocks.saveCloudKitchenProfile).not.toHaveBeenCalled();
  });

  it("puts the Hub switch back when saving it fails", async () => {
    mocks.setContributeToHub.mockRejectedValue(new Error("denied"));
    const { result } = renderHook(() => useKitchenSettings());
    await waitFor(() => expect(result.current.profile).not.toBeNull());
    await act(() => result.current.saveContributeToHub(true));
    expect(result.current.contributeToHub).toBe(false);
    expect(result.current.status).toBe("failed");
  });
});
