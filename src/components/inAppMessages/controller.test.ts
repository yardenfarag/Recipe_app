import { describe, expect, it, vi } from 'vitest';

import type { InAppMessage, MessageEvent, MessageReceipt } from '@shared/lib/inAppMessages';

import { createMessagesController, mergeReceipt, type FetchParams } from './controller';

const PARAMS: FetchParams = { platform: 'ios', appVersion: '1.0.9', language: 'en' };
const T0 = Date.parse('2026-11-15T12:00:00Z');

function message(id: string, extra: Partial<InAppMessage> = {}): InAppMessage {
  return {
    id,
    presentation: 'sheet',
    tone: 'info',
    content: { en: { title: id, body: '' } },
    dismissible: true,
    required: false,
    frequency: { type: 'once' },
    priority: 0,
    ...extra,
  };
}

function receipt(messageId: string, extra: Partial<MessageReceipt> = {}): MessageReceipt {
  return {
    messageId,
    firstSeenAt: '2026-11-14T10:00:00.000Z',
    lastSeenAt: '2026-11-14T10:00:00.000Z',
    seenCount: 1,
    dismissedAt: null,
    clickedAt: null,
    clickedButton: null,
    ...extra,
  };
}

function setup(
  fetched: { messages: InAppMessage[]; receipts?: Record<string, MessageReceipt> } = { messages: [] },
  options: { chainGapMs?: number; minRefreshIntervalMs?: number } = {},
) {
  let clock = T0;
  const state = { fetched };
  const recorded: { id: string; event: MessageEvent; button?: string }[] = [];
  const fetchMessages = vi.fn(async () => ({
    messages: state.fetched.messages,
    receipts: state.fetched.receipts ?? {},
  }));
  const timers: { fn: () => void; ms: number; cancelled: boolean }[] = [];
  const controller = createMessagesController({
    fetchMessages,
    recordEvent: async (id, event, button) => {
      recorded.push({ id, event, button });
    },
    now: () => clock,
    launchedAt: T0 - 1000,
    chainGapMs: options.chainGapMs ?? 0,
    minRefreshIntervalMs: options.minRefreshIntervalMs,
    setTimer: (fn, ms) => {
      const timer = { fn, ms, cancelled: false };
      timers.push(timer);
      return timer;
    },
    clearTimer: (handle) => {
      (handle as { cancelled: boolean }).cancelled = true;
    },
  });
  return {
    controller,
    fetchMessages,
    recorded,
    timers,
    state,
    advance: (ms: number) => {
      clock += ms;
    },
    fireTimers: () => {
      for (const timer of [...timers]) {
        if (!timer.cancelled) {
          timer.cancelled = true;
          timer.fn();
        }
      }
    },
    active: () => controller.getSnapshot().active?.id ?? null,
  };
}

describe('nothing happens before sign-in', () => {
  it('does not fetch or show while nobody is signed in', async () => {
    const t = setup({ messages: [message('a')] });
    await t.controller.refresh(PARAMS, { force: true });
    expect(t.fetchMessages).not.toHaveBeenCalled();
    expect(t.active()).toBeNull();
  });

  it('clears what it holds on sign-out', async () => {
    const t = setup({ messages: [message('a')] });
    t.controller.setUser('u1');
    await t.controller.refresh(PARAMS, { force: true });
    expect(t.active()).toBe('a');
    t.controller.setUser(null);
    expect(t.active()).toBeNull();
    expect(t.controller.peekReceipt('a')).toBeUndefined();
    await t.controller.refresh(PARAMS, { force: true });
    expect(t.fetchMessages).toHaveBeenCalledTimes(1);
  });

  it('ignores a fetch that finishes after the user signed out', async () => {
    const t = setup({ messages: [message('a')] });
    t.controller.setUser('u1');
    const pending = t.controller.refresh(PARAMS, { force: true });
    t.controller.setUser(null);
    await pending;
    expect(t.active()).toBeNull();
  });

  it('starts clean for a different user', async () => {
    const t = setup({ messages: [message('a')] });
    t.controller.setUser('u1');
    await t.controller.refresh(PARAMS, { force: true });
    t.controller.dismiss('a');
    t.controller.setUser('u2');
    await t.controller.refresh(PARAMS, { force: true });
    expect(t.active()).toBe('a');
  });
});

describe('choosing', () => {
  it('shows the highest priority message and records it as seen once', async () => {
    const t = setup({ messages: [message('low', { priority: 1 }), message('high', { priority: 5 })] });
    t.controller.setUser('u1');
    await t.controller.refresh(PARAMS, { force: true });
    expect(t.active()).toBe('high');
    t.controller.reportShown('high');
    t.controller.reportShown('high');
    // A second fetch with the same message on screen does not record it again.
    await t.controller.refresh(PARAMS, { force: true });
    expect(t.recorded.filter((r) => r.event === 'seen')).toEqual([{ id: 'high', event: 'seen', button: undefined }]);
  });

  it('waits for a message limited to a screen until the user is on it', async () => {
    const t = setup({ messages: [message('hub-only', { screens: ['/(tabs)/hub'] })] });
    t.controller.setUser('u1');
    t.controller.setRoute('/(tabs)');
    await t.controller.refresh(PARAMS, { force: true });
    expect(t.active()).toBeNull();
    t.controller.setRoute('/(tabs)/hub');
    expect(t.active()).toBe('hub-only');
  });

  it('shows a message after its delay', async () => {
    const t = setup({ messages: [message('late', { delaySeconds: 5 })] });
    t.controller.setUser('u1');
    await t.controller.refresh(PARAMS, { force: true });
    expect(t.active()).toBeNull();
    expect(t.timers[0]?.ms).toBe(5000);
    t.fireTimers();
    expect(t.active()).toBe('late');
  });

  it('skips a message already seen (shown once, across restarts)', async () => {
    const t = setup({ messages: [message('seen-before'), message('fresh')], receipts: { 'seen-before': receipt('seen-before') } });
    t.controller.setUser('u1');
    await t.controller.refresh(PARAMS, { force: true });
    expect(t.active()).toBe('fresh');
  });

  it('shows a message again on every launch once the launch has passed', async () => {
    const seenThisLaunch = receipt('e', { lastSeenAt: new Date(T0).toISOString() });
    const t = setup({ messages: [message('e', { frequency: { type: 'every_launch' } })], receipts: { e: seenThisLaunch } });
    t.controller.setUser('u1');
    await t.controller.refresh(PARAMS, { force: true });
    expect(t.active()).toBeNull();
  });

  it('shows the next message after one is closed, once, and never a closed one again', async () => {
    const t = setup({ messages: [message('first', { priority: 2 }), message('second', { priority: 1 })] });
    t.controller.setUser('u1');
    await t.controller.refresh(PARAMS, { force: true });
    expect(t.active()).toBe('first');
    t.controller.dismiss('first');
    expect(t.active()).toBe('second');
    t.controller.dismiss('second');
    expect(t.active()).toBeNull();
    await t.controller.refresh(PARAMS, { force: true });
    expect(t.active()).toBeNull();
  });

  it('leaves a gap before the next message so two dialogs never overlap', async () => {
    const t = setup({ messages: [message('first', { priority: 2 }), message('second')] }, { chainGapMs: 400 });
    t.controller.setUser('u1');
    await t.controller.refresh(PARAMS, { force: true });
    t.controller.dismiss('first');
    expect(t.active()).toBeNull();
    expect(t.timers.at(-1)?.ms).toBe(400);
    t.fireTimers();
    expect(t.active()).toBe('second');
  });

  it('lets a required message take over from an optional one', async () => {
    const t = setup({ messages: [message('optional')] });
    t.controller.setUser('u1');
    await t.controller.refresh(PARAMS, { force: true });
    expect(t.active()).toBe('optional');
    t.state.fetched = { messages: [message('optional'), message('update', { required: true, dismissible: false })] };
    await t.controller.refresh(PARAMS, { force: true });
    expect(t.active()).toBe('update');
  });
});

describe('recording', () => {
  it('records dismissed and closes', async () => {
    const t = setup({ messages: [message('a')] });
    t.controller.setUser('u1');
    await t.controller.refresh(PARAMS, { force: true });
    t.controller.reportShown('a');
    t.controller.dismiss('a');
    expect(t.active()).toBeNull();
    expect(t.recorded.map((r) => r.event)).toEqual(['seen', 'dismissed']);
  });

  it('records the button that was tapped and closes an optional message', async () => {
    const t = setup({ messages: [message('a')] });
    t.controller.setUser('u1');
    await t.controller.refresh(PARAMS, { force: true });
    t.controller.press('a', 'secondary');
    expect(t.recorded.at(-1)).toEqual({ id: 'a', event: 'clicked', button: 'secondary' });
    expect(t.active()).toBeNull();
  });

  it('keeps a required message on screen: it cannot be dismissed and a tap does not close it', async () => {
    const t = setup({ messages: [message('update', { required: true, dismissible: false, presentation: 'fullscreen' })] });
    t.controller.setUser('u1');
    await t.controller.refresh(PARAMS, { force: true });
    t.controller.reportShown('update');
    t.controller.dismiss('update');
    expect(t.active()).toBe('update');
    t.controller.press('update', 'primary');
    expect(t.active()).toBe('update');
    expect(t.recorded.map((r) => r.event)).toEqual(['seen', 'clicked']);
  });

  it('removes a required message when the next fetch no longer targets the user (after the update)', async () => {
    const t = setup({ messages: [message('update', { required: true, dismissible: false })] });
    t.controller.setUser('u1');
    await t.controller.refresh(PARAMS, { force: true });
    expect(t.active()).toBe('update');
    t.state.fetched = { messages: [] };
    await t.controller.refresh(PARAMS, { force: true });
    expect(t.active()).toBeNull();
  });

  it('removes a stopped message at the next fetch', async () => {
    const t = setup({ messages: [message('a', { frequency: { type: 'every_launch' } })] });
    t.controller.setUser('u1');
    await t.controller.refresh(PARAMS, { force: true });
    expect(t.active()).toBe('a');
    t.state.fetched = { messages: [] };
    await t.controller.refresh(PARAMS, { force: true });
    expect(t.active()).toBeNull();
  });

  it('keeps going when a write fails', async () => {
    const controller = createMessagesController({
      fetchMessages: async () => ({ messages: [message('a')], receipts: {} }),
      recordEvent: async () => {
        throw new Error('offline');
      },
      now: () => T0,
    });
    controller.setUser('u1');
    await controller.refresh(PARAMS, { force: true });
    expect(controller.getSnapshot().active?.id).toBe('a');
    controller.dismiss('a');
    expect(controller.getSnapshot().active).toBeNull();
    expect(controller.peekReceipt('a')?.dismissedAt).not.toBeNull();
  });
});

describe('fetching', () => {
  it('is silent when the fetch fails', async () => {
    const controller = createMessagesController({
      fetchMessages: async () => {
        throw new Error('offline');
      },
      recordEvent: async () => {},
    });
    controller.setUser('u1');
    await expect(controller.refresh(PARAMS, { force: true })).resolves.toBeUndefined();
    expect(controller.getSnapshot().active).toBeNull();
  });

  it('skips a refresh that follows the last one too closely unless forced', async () => {
    const t = setup({ messages: [] }, { minRefreshIntervalMs: 30_000 });
    t.controller.setUser('u1');
    await t.controller.refresh(PARAMS);
    await t.controller.refresh(PARAMS);
    expect(t.fetchMessages).toHaveBeenCalledTimes(1);
    t.advance(31_000);
    await t.controller.refresh(PARAMS);
    expect(t.fetchMessages).toHaveBeenCalledTimes(2);
    await t.controller.refresh(PARAMS, { force: true });
    expect(t.fetchMessages).toHaveBeenCalledTimes(3);
  });

  it('keeps an event the server has not got yet when a fetch lands', async () => {
    const t = setup({ messages: [message('a', { frequency: { type: 'every_launch' } })] });
    t.controller.setUser('u1');
    await t.controller.refresh(PARAMS, { force: true });
    t.controller.press('a', 'primary');
    // The server answers with a receipt that predates the tap.
    t.state.fetched = { messages: [message('a', { frequency: { type: 'every_launch' } })], receipts: { a: receipt('a') } };
    await t.controller.refresh(PARAMS, { force: true });
    expect(t.controller.peekReceipt('a')?.clickedButton).toBe('primary');
  });
});

describe('preview', () => {
  it('shows a sample without recording anything, and clears it', async () => {
    const t = setup({ messages: [] });
    t.controller.setUser('u1');
    t.controller.preview(message('sample'));
    expect(t.active()).toBe('sample');
    t.controller.dismiss('sample');
    expect(t.active()).toBeNull();
    expect(t.recorded).toEqual([]);
  });

  it('survives the session resolving after the sample opened (a sample opened from the URL)', () => {
    const t = setup({ messages: [] });
    t.controller.preview(message('sample'));
    t.controller.setUser('u1');
    expect(t.active()).toBe('sample');
    t.controller.dismiss('sample');
    expect(t.active()).toBeNull();
    expect(t.recorded).toEqual([]);
  });
});

describe('seen is recorded only when the message is really on screen', () => {
  it('records nothing until the presenter reports it shown, and only once', async () => {
    const t = setup({ messages: [message('a')] });
    t.controller.setUser('u1');
    await t.controller.refresh(PARAMS, { force: true });
    expect(t.active()).toBe('a');
    // An iOS modal that could not be presented over another modal never reports.
    expect(t.recorded).toEqual([]);
    t.controller.reportShown('a');
    t.controller.reportShown('a');
    expect(t.recorded.map((r) => r.event)).toEqual(['seen']);
  });

  it('ignores a report for a message that is not the active one', async () => {
    const t = setup({ messages: [message('a')] });
    t.controller.setUser('u1');
    await t.controller.refresh(PARAMS, { force: true });
    t.controller.reportShown('other');
    expect(t.recorded).toEqual([]);
  });

  it('shows nothing while the sign-in screens are up, then the message once the user lands in the app', async () => {
    const t = setup({ messages: [message('a')] });
    t.controller.setRoute('/auth');
    t.controller.setUser('u1');
    await t.controller.refresh(PARAMS, { force: true });
    expect(t.active()).toBeNull();
    for (const route of ['/welcome', '/onboarding', '/reset-password', '/auth-callback']) {
      t.controller.setRoute(route);
      expect(t.active()).toBeNull();
    }
    t.controller.setRoute('/(tabs)');
    expect(t.active()).toBe('a');
    expect(t.recorded).toEqual([]);
  });

  it('does not place a delayed message while a sign-in screen is up', async () => {
    const t = setup({ messages: [message('late', { delaySeconds: 5 })] });
    t.controller.setRoute('/(tabs)');
    t.controller.setUser('u1');
    await t.controller.refresh(PARAMS, { force: true });
    t.controller.setRoute('/auth');
    t.fireTimers();
    expect(t.active()).toBeNull();
  });

  it('keeps a banner back while a screen is pushed over the tabs, and records it once the tabs show', async () => {
    const banner = message('b', { presentation: 'banner' });
    const t = setup({ messages: [banner] });
    t.controller.setUser('u1');
    // Opened from a shared recipe link: nothing draws a banner under that screen.
    t.controller.setRoute('/recipe/1');
    await t.controller.refresh(PARAMS, { force: true });
    expect(t.active()).toBeNull();
    t.controller.setRoute('/(tabs)');
    expect(t.active()).toBe('b');
    t.controller.reportShown('b');
    expect(t.recorded.map((r) => r.event)).toEqual(['seen']);
  });

  it('does not record a banner that is mounted but hidden under a pushed screen', async () => {
    const t = setup({ messages: [message('b', { presentation: 'banner' })] });
    t.controller.setUser('u1');
    t.controller.setRoute('/(tabs)');
    await t.controller.refresh(PARAMS, { force: true });
    t.controller.setRoute('/recipe/1');
    t.controller.reportShown('b');
    expect(t.recorded).toEqual([]);
    t.controller.setRoute('/(tabs)');
    expect(t.recorded.map((r) => r.event)).toEqual(['seen']);
  });

  it('lets a sheet through while a banner has to wait for the tabs', async () => {
    const t = setup({ messages: [message('b', { presentation: 'banner', priority: 9 }), message('s', { priority: 1 })] });
    t.controller.setUser('u1');
    t.controller.setRoute('/recipe/1');
    await t.controller.refresh(PARAMS, { force: true });
    expect(t.active()).toBe('s');
  });
});

describe('hiding a message for this launch (admin way out)', () => {
  const required = () => message('update', { required: true, dismissible: false, presentation: 'fullscreen' });

  it('hides a required message for the rest of the launch and records nothing', async () => {
    const t = setup({ messages: [required()] });
    t.controller.setUser('u1');
    await t.controller.refresh(PARAMS, { force: true });
    t.controller.reportShown('update');
    t.controller.hideForThisLaunch('update');
    expect(t.active()).toBeNull();
    expect(t.recorded.map((r) => r.event)).toEqual(['seen']);
    // A fetch brings the message back from the server, but it stays hidden this launch.
    await t.controller.refresh(PARAMS, { force: true });
    expect(t.active()).toBeNull();
  });

  it('does not let a user dismiss a required message the normal way', async () => {
    const t = setup({ messages: [required()] });
    t.controller.setUser('u1');
    await t.controller.refresh(PARAMS, { force: true });
    t.controller.dismiss('update');
    expect(t.active()).toBe('update');
  });
});

describe('mergeReceipt', () => {
  it('takes the further-along value per field', () => {
    const server = receipt('a', { seenCount: 1, dismissedAt: null });
    const local = receipt('a', {
      seenCount: 2,
      lastSeenAt: '2026-11-15T09:00:00.000Z',
      dismissedAt: '2026-11-15T09:01:00.000Z',
    });
    expect(mergeReceipt(server, local)).toMatchObject({
      seenCount: 2,
      lastSeenAt: '2026-11-15T09:00:00.000Z',
      dismissedAt: '2026-11-15T09:01:00.000Z',
    });
    expect(mergeReceipt(undefined, local)).toBe(local);
    expect(mergeReceipt(server, undefined)).toBe(server);
  });
});
