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

const auth = vi.hoisted(() => ({ value: { user: null as unknown, loading: false } }));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => auth.value }));
vi.mock("@/lib/i18n", async (original) => ({
  ...(await original<typeof import("@/lib/i18n")>()),
  changeLanguage: vi.fn(async () => {}),
}));

vi.mock("@/lib/accountPreferences", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    accountPreferences: () => store.sync,
    useAccountPreferences: () => useSyncExternalStore(store.sync.subscribe, store.sync.getSnapshot, store.sync.getSnapshot),
  };
});

import { LanguageProvider, useLanguage } from "./LanguageProvider";

const html = () => document.documentElement;
const KEY = "pinch:appLanguage";

describe("LanguageProvider and the account (PIN-154)", () => {
  beforeEach(() => {
    store.reset();
    window.localStorage.clear();
    auth.value = { user: null, loading: false };
    vi.clearAllMocks();
  });

  it("signed out: this browser's pick, else the browser's language, offered for the first sync", () => {
    window.localStorage.setItem(KEY, "ru");
    const { result } = renderHook(() => useLanguage(), { wrapper: LanguageProvider });
    expect(result.current.language).toBe("ru");
    expect(html().lang).toBe("ru");
    expect(store.sync.reportDevice).toHaveBeenLastCalledWith({ language: "ru" });
  });

  it("the account's language wins over this browser's pick and becomes the pick", () => {
    window.localStorage.setItem(KEY, "en");
    auth.value = { user: { id: "u1", user_metadata: { locale: "he" } }, loading: false };
    store.set({ userId: "u1", loaded: false, prefs: { language: "he" } });
    const { result } = renderHook(() => useLanguage(), { wrapper: LanguageProvider });
    expect(result.current.language).toBe("he");
    expect(html().dir).toBe("rtl");
    expect(window.localStorage.getItem(KEY)).toBe("he");
    expect(store.sync.save).not.toHaveBeenCalled();

    // Changed on the phone; signing out afterwards keeps it.
    act(() => store.set({ userId: "u1", loaded: true, prefs: { language: "es" } }));
    expect(result.current.language).toBe("es");
    act(() => store.set({ userId: null, loaded: true, prefs: {} }));
    expect(result.current.language).toBe("es");
  });

  it("a change here is saved on the account", () => {
    store.set({ userId: "u1", loaded: true, prefs: { language: "en" } });
    const { result } = renderHook(() => useLanguage(), { wrapper: LanguageProvider });
    act(() => result.current.setLanguage("ar"));
    expect(result.current.language).toBe("ar");
    expect(html().dir).toBe("rtl");
    expect(store.sync.save).toHaveBeenCalledWith({ language: "ar" });
    expect(window.localStorage.getItem(KEY)).toBe("ar");
  });
});
