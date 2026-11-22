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
    save: vi.fn((changes: Record<string, unknown>) => {
      if (snapshot.userId) set({ ...snapshot, prefs: { ...snapshot.prefs, ...changes } });
    }),
    reportDevice: vi.fn(),
  };
  return { set, sync, reset: () => (snapshot = { userId: null, loaded: true, prefs: {} }) };
});

const language = vi.hoisted(() => ({ value: "en" }));

vi.mock("@/lib/accountPreferences", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    accountPreferences: () => store.sync,
    useAccountPreferences: () => useSyncExternalStore(store.sync.subscribe, store.sync.getSnapshot, store.sync.getSnapshot),
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ i18n: { language: language.value, resolvedLanguage: language.value } }),
}));

import { useUnitSystem } from "./useUnitSystem";

const KEY = "pinch:unitSystem";

describe("useUnitSystem (PIN-53)", () => {
  beforeEach(() => {
    store.reset();
    window.localStorage.clear();
    language.value = "en";
    vi.clearAllMocks();
  });

  it("follows the app language until the cook picks: US for English, Metric otherwise", () => {
    const { result, rerender } = renderHook(() => useUnitSystem());
    expect(result.current).toMatchObject({ units: "us", choice: undefined });
    language.value = "he";
    rerender();
    expect(result.current.units).toBe("metric");
  });

  it("keeps a pick in this browser and saves it on the account", () => {
    const { result } = renderHook(() => useUnitSystem());
    act(() => result.current.setUnits("metric"));
    expect(result.current).toMatchObject({ units: "metric", choice: "metric" });
    expect(window.localStorage.getItem(KEY)).toBe("metric");
    expect(store.sync.save).toHaveBeenCalledWith({ units: "metric" });
  });

  it("the account's pick wins over the language and becomes this browser's copy", () => {
    language.value = "he";
    const { result } = renderHook(() => useUnitSystem());
    act(() => store.set({ userId: "u1", loaded: true, prefs: { units: "us" } }));
    expect(result.current.units).toBe("us");
    expect(window.localStorage.getItem(KEY)).toBe("us");
    expect(store.sync.save).not.toHaveBeenCalled();
  });
});
