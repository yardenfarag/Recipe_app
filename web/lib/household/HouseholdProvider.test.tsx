import { act, render } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { HouseholdChange } from "@shared/lib/supabase/household";

import { household } from "@/components/household/testHousehold";

const api = vi.hoisted(() => ({ fetchHousehold: vi.fn(), subscribeToHousehold: vi.fn() }));
vi.mock("@shared/lib/supabase/household", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@shared/lib/supabase/household")>()),
  ...api,
}));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => ({ user: { id: "me" }, session: null, loading: false }) }));

import { HouseholdProvider, LIVE_DEBOUNCE_MS, useHousehold, useHouseholdLive } from "./HouseholdProvider";

let emit: (what: HouseholdChange) => void = () => undefined;
const unsubscribe = vi.fn();
const onList = vi.fn();
const onPantry = vi.fn();
const latest: { value: ReturnType<typeof useHousehold> | null } = { value: null };

function Probe() {
  const value = useHousehold();
  useEffect(() => {
    latest.value = value;
  });
  useHouseholdLive("list", onList);
  useHouseholdLive("pantry", onPantry);
  return null;
}

const flush = () => act(async () => undefined);

beforeEach(() => {
  vi.useFakeTimers();
  api.fetchHousehold.mockReset().mockResolvedValue(household());
  api.subscribeToHousehold.mockReset().mockImplementation((_id: string, onChange: (what: HouseholdChange) => void) => {
    emit = onChange;
    return unsubscribe;
  });
  onList.mockReset();
  onPantry.mockReset();
  unsubscribe.mockReset();
});

afterEach(() => vi.useRealTimers());

describe("HouseholdProvider", () => {
  it("reads the household and subscribes to it", async () => {
    render(
      <HouseholdProvider>
        <Probe />
      </HouseholdProvider>,
    );
    await flush();
    expect(latest.value?.household?.name).toBe("The Cohens");
    expect(api.subscribeToHousehold).toHaveBeenCalledWith("h1", expect.any(Function));
  });

  it("tells the list once for a burst of changes, after a short wait", async () => {
    render(
      <HouseholdProvider>
        <Probe />
      </HouseholdProvider>,
    );
    await flush();
    act(() => {
      emit("list");
      emit("list");
      emit("list");
    });
    expect(onList).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(LIVE_DEBOUNCE_MS));
    expect(onList).toHaveBeenCalledTimes(1);
    expect(onPantry).not.toHaveBeenCalled();
  });

  it("reads the household again when the household itself changed", async () => {
    render(
      <HouseholdProvider>
        <Probe />
      </HouseholdProvider>,
    );
    await flush();
    api.fetchHousehold.mockResolvedValue(household({ name: "Home" }));
    act(() => emit("household"));
    act(() => vi.advanceTimersByTime(LIVE_DEBOUNCE_MS));
    await flush();
    expect(latest.value?.household?.name).toBe("Home");
  });

  it("tells the list and pantry when I'm in another household, and resubscribes", async () => {
    render(
      <HouseholdProvider>
        <Probe />
      </HouseholdProvider>,
    );
    await flush();
    act(() => latest.value?.apply(household({ id: "h2" })));
    await flush();
    expect(onList).toHaveBeenCalledTimes(1);
    expect(onPantry).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalled();
    expect(api.subscribeToHousehold).toHaveBeenLastCalledWith("h2", expect.any(Function));
  });

  it("keeps what it has when a later read fails", async () => {
    render(
      <HouseholdProvider>
        <Probe />
      </HouseholdProvider>,
    );
    await flush();
    api.fetchHousehold.mockRejectedValue(new Error("offline"));
    await act(async () => {
      await latest.value?.refresh();
    });
    expect(latest.value?.household?.name).toBe("The Cohens");
    expect(latest.value?.failed).toBe(false);
  });
});
