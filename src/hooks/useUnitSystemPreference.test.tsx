/**
 * Metric or US follows the app language until picked, then the account, with a device copy (PIN-53).
 * React Native Testing Library v14: render and act are async, always await them.
 */
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UnitSystemProvider, useUnitSystemPreference } from '@/hooks/useUnitSystemPreference';

const language = vi.hoisted(() => ({ value: 'en' }));

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

vi.mock('@/hooks/useAccountPreferences', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    accountPreferences: mocks.sync,
    useAccountPreferences: () => useSyncExternalStore(mocks.sync.subscribe, mocks.sync.getSnapshot, mocks.sync.getSnapshot),
  };
});

vi.mock('@/hooks/useLanguagePreference', () => ({ useLanguagePreference: () => ({ language: language.value }) }));

const wrapper = ({ children }: { children: ReactNode }) => <UnitSystemProvider>{children}</UnitSystemProvider>;
const KEY = 'pinch:unitSystem';

describe('UnitSystemProvider', () => {
  beforeEach(() => {
    mocks.reset();
    language.value = 'en';
    vi.clearAllMocks();
  });

  it('defaults to US in English and Metric in Hebrew, without saving anything', async () => {
    const { result, rerender } = await renderHook(() => useUnitSystemPreference(), { wrapper });
    expect(result.current.units).toBe('us');
    language.value = 'he';
    await rerender({});
    expect(result.current.units).toBe('metric');
    expect(mocks.sync.save).not.toHaveBeenCalled();
  });

  it('reads the device copy and reports it for the first sync', async () => {
    mocks.storage.set(KEY, 'metric');
    const { result } = await renderHook(() => useUnitSystemPreference(), { wrapper });
    await vi.waitFor(() => expect(result.current.units).toBe('metric'));
    expect(mocks.sync.reportDevice).toHaveBeenCalledWith({ units: 'metric' });
  });

  it('saves a pick on the device and the account', async () => {
    const { result } = await renderHook(() => useUnitSystemPreference(), { wrapper });
    await act(async () => result.current.setUnits('metric'));
    expect(result.current.units).toBe('metric');
    await vi.waitFor(() => expect(mocks.storage.get(KEY)).toBe('metric'));
    expect(mocks.sync.save).toHaveBeenCalledWith({ units: 'metric' });
  });

  it("the account's pick wins and becomes the device copy", async () => {
    language.value = 'he';
    const { result } = await renderHook(() => useUnitSystemPreference(), { wrapper });
    await act(async () => mocks.set({ userId: 'u1', loaded: true, prefs: { units: 'us' } }));
    expect(result.current.units).toBe('us');
    await vi.waitFor(() => expect(mocks.storage.get(KEY)).toBe('us'));
  });
});
