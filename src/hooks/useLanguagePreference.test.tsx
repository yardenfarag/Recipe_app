/**
 * The app language follows the account once it is known, keeps a device copy, and saves changes (PIN-154).
 * React Native Testing Library v14: render and act are async, always await them.
 */
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider, useLanguagePreference } from '@/hooks/useLanguagePreference';

const mocks = vi.hoisted(() => {
  type Snapshot = { userId: string | null; loaded: boolean; prefs: Record<string, unknown> };
  let snapshot: Snapshot = { userId: null, loaded: true, prefs: {} };
  const listeners = new Set<() => void>();
  const storage = new Map<string, string>();
  const set = (next: Snapshot) => {
    snapshot = next;
    for (const listener of listeners) listener();
  };
  return {
    storage,
    set,
    reset: () => {
      snapshot = { userId: null, loaded: true, prefs: {} };
      storage.clear();
    },
    sync: {
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      getSnapshot: () => snapshot,
      // Like the real store: signed in, the change shows on the account at once.
      save: vi.fn((changes: Record<string, unknown>) => {
        if (snapshot.userId) set({ ...snapshot, prefs: { ...snapshot.prefs, ...changes } });
      }),
      reportDevice: vi.fn(),
    },
  };
});

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => mocks.storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => void mocks.storage.set(key, value)),
  },
}));

vi.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'es' }] }));

vi.mock('@/hooks/useAccountPreferences', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    accountPreferences: mocks.sync,
    useAccountPreferences: () => useSyncExternalStore(mocks.sync.subscribe, mocks.sync.getSnapshot, mocks.sync.getSnapshot),
  };
});

const wrapper = ({ children }: { children: ReactNode }) => <LanguageProvider>{children}</LanguageProvider>;
const KEY = 'pinch:appLanguage';

describe('LanguageProvider', () => {
  beforeEach(() => {
    mocks.reset();
    vi.clearAllMocks();
  });

  it("starts with the device's language and reports only a language picked on the device", async () => {
    const { result } = await renderHook(() => useLanguagePreference(), { wrapper });
    await vi.waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.language).toBe('es');
    expect(mocks.sync.reportDevice).not.toHaveBeenCalled();
  });

  it('reads the device copy and reports it for the first sync', async () => {
    mocks.storage.set(KEY, 'ru');
    const { result } = await renderHook(() => useLanguagePreference(), { wrapper });
    await vi.waitFor(() => expect(result.current.language).toBe('ru'));
    expect(mocks.sync.reportDevice).toHaveBeenCalledWith({ language: 'ru' });
  });

  it("the account's language wins in the same render, becomes the device copy, and stays after sign-out", async () => {
    mocks.storage.set(KEY, 'en');
    const { result } = await renderHook(() => useLanguagePreference(), { wrapper });
    await vi.waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => mocks.set({ userId: 'u1', loaded: false, prefs: { language: 'he' } }));
    expect(result.current.language).toBe('he');
    await vi.waitFor(() => expect(mocks.storage.get(KEY)).toBe('he'));
    expect(mocks.sync.save).not.toHaveBeenCalled();

    await act(async () => mocks.set({ userId: null, loaded: true, prefs: {} }));
    expect(result.current.language).toBe('he');
  });

  it('a change here is kept on the device and saved on the account', async () => {
    mocks.set({ userId: 'u1', loaded: true, prefs: { language: 'en' } });
    const { result } = await renderHook(() => useLanguagePreference(), { wrapper });
    await act(async () => result.current.setLanguage('ar'));
    expect(result.current.language).toBe('ar');
    expect(mocks.sync.save).toHaveBeenCalledWith({ language: 'ar' });
    expect(mocks.storage.get(KEY)).toBe('ar');
  });
});
