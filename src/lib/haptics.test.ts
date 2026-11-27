import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  notificationAsync: vi.fn(async (_type?: string) => undefined),
  impactAsync: vi.fn(async (_style?: string) => undefined),
  selectionAsync: vi.fn(async () => undefined),
}));

vi.mock('expo-haptics', () => ({
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  notificationAsync: mocks.notificationAsync,
  impactAsync: mocks.impactAsync,
  selectionAsync: mocks.selectionAsync,
}));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => mocks.storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => void mocks.storage.set(key, value)),
  },
}));

/** A fresh copy of the module, so each test starts from what this device has saved. */
async function load() {
  vi.resetModules();
  const mod = await import('./haptics');
  // Let the saved switch load.
  await new Promise((resolve) => setTimeout(resolve, 0));
  return mod;
}

beforeEach(() => {
  mocks.storage.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('haptics', () => {
  it('plays each moment with its own feel', async () => {
    const { haptics } = await load();
    haptics.saved();
    haptics.cooked();
    haptics.timerDone();
    haptics.error();
    expect(mocks.notificationAsync.mock.calls.map(([type]) => type)).toEqual([
      'success',
      'success',
      'warning',
      'error',
    ]);
    haptics.step();
    haptics.refresh();
    expect(mocks.impactAsync.mock.calls.map(([style]) => style)).toEqual(['light', 'light']);
    haptics.tick();
    expect(mocks.selectionAsync).toHaveBeenCalledTimes(1);
  });

  it('is on until the switch is turned off, then stays off on this device', async () => {
    const first = await load();
    first.setHapticsEnabled(false);
    first.haptics.saved();
    expect(mocks.notificationAsync).not.toHaveBeenCalled();
    expect(mocks.storage.get(first.HAPTICS_STORAGE_KEY)).toBe('off');

    const next = await load();
    next.haptics.tick();
    expect(mocks.selectionAsync).not.toHaveBeenCalled();

    next.setHapticsEnabled(true);
    next.haptics.tick();
    expect(mocks.selectionAsync).toHaveBeenCalledTimes(1);
  });

  it('never throws when the phone cannot buzz', async () => {
    mocks.notificationAsync.mockRejectedValueOnce(new Error('no haptics'));
    const { haptics } = await load();
    expect(() => haptics.saved()).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});
