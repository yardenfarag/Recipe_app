import { describe, expect, it } from 'vitest';

import type { InAppMessage } from '@shared/lib/inAppMessages';

import { createMessagesController } from './controller';
import { webClosedStore, webLaunchStartedAt } from './webLaunch';

function fakeStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, value),
  };
}

const banner: InAppMessage = {
  id: 'b',
  presentation: 'banner',
  tone: 'info',
  content: { en: { title: 'Hi', body: '' } },
  dismissible: true,
  required: false,
  frequency: { type: 'every_launch' },
  priority: 0,
};
const PARAMS = { platform: 'web' as const, appVersion: '1.0.10', language: 'en' };

/** One page load: a fresh controller over the same tab storage. */
function pageLoad(store: Storage) {
  return createMessagesController({
    fetchMessages: async () => ({ messages: [banner], receipts: {} }),
    recordEvent: async () => {},
    chainGapMs: 0,
    launchedAt: webLaunchStartedAt(Date.now(), store),
    closedStore: webClosedStore(store),
  });
}

describe('web launch is the browser tab', () => {
  it('keeps the first page load time for later loads in the tab', () => {
    const store = fakeStorage();
    expect(webLaunchStartedAt(1000, store)).toBe(1000);
    expect(webLaunchStartedAt(5000, store)).toBe(1000);
  });

  it('is off the web when there is no storage', () => {
    expect(webLaunchStartedAt(1000, null)).toBeUndefined();
    expect(webClosedStore(null)).toBeUndefined();
  });

  it('a banner closed before a reload stays closed after it', async () => {
    const store = fakeStorage();
    const first = pageLoad(store);
    first.setRoute('/(tabs)');
    first.setUser('u1');
    await first.refresh(PARAMS, { force: true });
    expect(first.getSnapshot().active?.id).toBe('b');
    first.dismiss('b');

    const reloaded = pageLoad(store);
    reloaded.setRoute('/(tabs)');
    reloaded.setUser('u1');
    await reloaded.refresh(PARAMS, { force: true });
    expect(reloaded.getSnapshot().active).toBeNull();
  });

  it('signing out forgets what was closed', async () => {
    const store = fakeStorage();
    const c = pageLoad(store);
    c.setRoute('/(tabs)');
    c.setUser('u1');
    await c.refresh(PARAMS, { force: true });
    c.dismiss('b');
    c.setUser(null);
    expect(webClosedStore(store)?.load()).toEqual([]);
  });
});
