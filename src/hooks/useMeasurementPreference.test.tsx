/**
 * Spoons or grams follows the account once it is known, keeps a device copy, and saves changes (PIN-154).
 * React Native Testing Library v14: render and act are async, always await them.
 */
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MeasurementProvider, useMeasurementPreference } from '@/hooks/useMeasurementPreference';

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

const wrapper = ({ children }: { children: ReactNode }) => <MeasurementProvider>{children}</MeasurementProvider>;
const KEY = 'pinch:measurementSystem';

describe('MeasurementProvider', () => {
  beforeEach(() => {
    mocks.reset();
    vi.clearAllMocks();
  });

  it('reads the device copy and reports it for the first sync', async () => {
    mocks.storage.set(KEY, 'metric');
    const { result } = await renderHook(() => useMeasurementPreference(), { wrapper });
    await vi.waitFor(() => expect(result.current.system).toBe('metric'));
    expect(mocks.sync.reportDevice).toHaveBeenCalledWith({ measurement: 'metric' });
    expect(mocks.sync.save).not.toHaveBeenCalled();
  });

  it("the account's choice wins and becomes the device copy, without saving it back", async () => {
    mocks.storage.set(KEY, 'original');
    const { result } = await renderHook(() => useMeasurementPreference(), { wrapper });
    await act(async () => mocks.set({ userId: 'u1', loaded: true, prefs: { measurement: 'metric' } }));
    expect(result.current.system).toBe('metric');
    await vi.waitFor(() => expect(mocks.storage.get(KEY)).toBe('metric'));
    expect(mocks.sync.save).not.toHaveBeenCalled();

    // Signing out keeps it.
    await act(async () => mocks.set({ userId: null, loaded: true, prefs: {} }));
    expect(result.current.system).toBe('metric');
  });

  it('a change here is kept on the device and saved on the account', async () => {
    mocks.set({ userId: 'u1', loaded: true, prefs: { measurement: 'original' } });
    const { result } = await renderHook(() => useMeasurementPreference(), { wrapper });
    await act(async () => result.current.setSystem('metric'));
    expect(result.current.system).toBe('metric');
    expect(mocks.sync.save).toHaveBeenCalledWith({ measurement: 'metric' });
    expect(mocks.storage.get(KEY)).toBe('metric');
  });
});
