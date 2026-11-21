import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => {
  type Snapshot = { userId: string | null; loaded: boolean; prefs: Record<string, unknown> };
  let snapshot: Snapshot = { userId: null, loaded: true, prefs: {} };
  const listeners = new Set<() => void>();
  const set = (next: Snapshot) => {
    snapshot = next;
    for (const listener of listeners) listener();
  };
  const sync = {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    // Like the real store: signed in, the change shows on the account at once.
    save: vi.fn((changes: Record<string, unknown>) => {
      if (snapshot.userId) set({ ...snapshot, prefs: { ...snapshot.prefs, ...changes } });
    }),
    reportDevice: vi.fn(),
  };
  return { set, sync, reset: () => (snapshot = { userId: null, loaded: true, prefs: {} }) };
});

vi.mock("@/lib/accountPreferences", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    accountPreferences: () => store.sync,
    useAccountPreferences: () => useSyncExternalStore(store.sync.subscribe, store.sync.getSnapshot, store.sync.getSnapshot),
  };
});

import { useMeasurementSystem } from "./useMeasurementSystem";

const KEY = "pinch:measurementSystem";

describe("useMeasurementSystem and the account (PIN-154)", () => {
  beforeEach(() => {
    store.reset();
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it("signed out, keeps the choice in this browser only", () => {
    const { result } = renderHook(() => useMeasurementSystem());
    act(() => result.current.setSystem("metric"));
    expect(result.current.system).toBe("metric");
    expect(window.localStorage.getItem(KEY)).toBe("metric");
    expect(store.sync.save).toHaveBeenCalledWith({ measurement: "metric" });
  });

  it("the account's choice wins, becomes this browser's copy, and stays after signing out", () => {
    window.localStorage.setItem(KEY, "original");
    const { result } = renderHook(() => useMeasurementSystem());
    expect(result.current.system).toBe("original");

    act(() => store.set({ userId: "u1", loaded: true, prefs: { measurement: "metric" } }));
    expect(result.current.system).toBe("metric");
    expect(window.localStorage.getItem(KEY)).toBe("metric");
    expect(store.sync.save).not.toHaveBeenCalled();

    act(() => store.set({ userId: null, loaded: true, prefs: {} }));
    expect(result.current.system).toBe("metric");
  });

  it("signed in, a change shows at once and is saved on the account", () => {
    store.set({ userId: "u1", loaded: true, prefs: { measurement: "metric" } });
    const { result } = renderHook(() => useMeasurementSystem());
    act(() => result.current.setSystem("original"));
    expect(result.current.system).toBe("original");
    expect(store.sync.save).toHaveBeenCalledWith({ measurement: "original" });
    expect(window.localStorage.getItem(KEY)).toBe("original");
  });
});
