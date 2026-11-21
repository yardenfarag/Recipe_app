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

import { ThemeProvider, useTheme } from "./ThemeProvider";

const root = () => document.documentElement;

describe("ThemeProvider and the account (PIN-154)", () => {
  beforeEach(() => {
    store.reset();
    window.localStorage.clear();
    root().removeAttribute("data-pack");
    root().removeAttribute("data-scheme");
    vi.clearAllMocks();
    window.matchMedia = vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) as never;
  });

  it("starts from this browser's copy", () => {
    window.localStorage.setItem("pinch.themePreference", "dark");
    window.localStorage.setItem("pinch.themePack", "dracula");
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });
    expect(result.current.preference).toBe("dark");
    expect(root().getAttribute("data-scheme")).toBe("dark");
    expect(root().getAttribute("data-pack")).toBe("dracula");
    expect(store.sync.save).not.toHaveBeenCalled();
  });

  it("the account's choice wins over this browser's, is copied here, and is not saved back", () => {
    window.localStorage.setItem("pinch.themePreference", "light");
    store.set({ userId: "u1", loaded: false, prefs: { scheme: "dark", pack: "wizard" } });
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });
    expect(root().getAttribute("data-scheme")).toBe("dark");
    expect(root().getAttribute("data-pack")).toBe("wizard");
    expect(window.localStorage.getItem("pinch.themePreference")).toBe("dark");
    expect(window.localStorage.getItem("pinch.themePack")).toBe("wizard");

    // A change from the phone, arriving later.
    act(() => store.set({ userId: "u1", loaded: true, prefs: { scheme: "light", pack: "wizard" } }));
    expect(result.current.preference).toBe("light");
    expect(root().getAttribute("data-scheme")).toBe("light");
    expect(store.sync.save).not.toHaveBeenCalled();
  });

  it("a change here is saved on the account", () => {
    store.set({ userId: "u1", loaded: true, prefs: { scheme: "dark" } });
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });
    act(() => result.current.setPack("dracula"));
    act(() => result.current.setPreference("system"));
    expect(store.sync.save).toHaveBeenCalledWith({ pack: "dracula" });
    expect(store.sync.save).toHaveBeenCalledWith({ scheme: "system" });
    expect(result.current.pack).toBe("dracula");
    expect(result.current.preference).toBe("system");
  });
});
