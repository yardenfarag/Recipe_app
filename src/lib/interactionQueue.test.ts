import { describe, expect, it, vi } from 'vitest';

import { createInteractionQueue, sanitizeEventName, type InteractionEvent } from './interactionQueue';

function setup(overrides: Partial<Parameters<typeof createInteractionQueue>[0]> = {}) {
  let clock = 1_000_000;
  const timers: { fn: () => void; ms: number }[] = [];
  const sent: { session: string; events: InteractionEvent[] }[] = [];
  let sessions = 0;
  const queue = createInteractionQueue({
    send: async (session, events) => {
      sent.push({ session, events });
    },
    newSessionId: () => `session-${++sessions}`,
    now: () => clock,
    setTimer: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    },
    clearTimer: () => {},
    batchSize: 3,
    maxQueued: 5,
    ...overrides,
  });
  return {
    queue,
    sent,
    timers,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

describe('sanitizeEventName', () => {
  it('keeps route patterns and dotted ids', () => {
    expect(sanitizeEventName('/(tabs)/recipe/[id]')).toBe('/(tabs)/recipe/[id]');
    expect(sanitizeEventName('recipe.save')).toBe('recipe.save');
  });

  it('replaces anything outside the allowed set', () => {
    expect(sanitizeEventName('hello world!')).toBe('hello_world_');
    expect(sanitizeEventName('')).toBe('unnamed');
  });
});

describe('createInteractionQueue', () => {
  it('does not send anything until the timer fires or a batch fills', async () => {
    const { queue, sent, timers } = setup();
    queue.tap('a');
    expect(sent).toHaveLength(0);
    expect(timers).toHaveLength(1);
    timers[0].fn();
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].events.map((e) => e.name)).toEqual(['a']);
  });

  it('sends as soon as a batch is full', async () => {
    const { queue, sent } = setup();
    queue.tap('a');
    queue.tap('b');
    queue.tap('c');
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].events).toHaveLength(3);
  });

  it('tags taps with the current screen and skips repeated screen views', async () => {
    const { queue, sent } = setup();
    queue.screen('/hub');
    queue.screen('/hub');
    queue.tap('hub.open');
    queue.tap('hub.filter');
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].events.map((e) => [e.kind, e.name, e.screen])).toEqual([
      ['screen', '/hub', null],
      ['tap', 'hub.open', '/hub'],
      ['tap', 'hub.filter', '/hub'],
    ]);
  });

  it('caps the queue by dropping the oldest events', () => {
    const { queue } = setup({ batchSize: 100, maxQueued: 5 });
    for (let i = 0; i < 8; i++) queue.tap(`t${i}`);
    expect(queue.size).toBe(5);
  });

  it('retries a failed batch once, then drops it', async () => {
    const send = vi.fn().mockRejectedValue(new Error('offline'));
    const { queue } = setup({ send, batchSize: 100 });
    queue.tap('a');
    await queue.flush();
    expect(queue.size).toBe(1);
    await queue.flush();
    expect(queue.size).toBe(0);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('flushes on background and starts a new session after a long absence', async () => {
    const { queue, sent, advance } = setup({ batchSize: 100, sessionIdleMs: 1000 });
    queue.screen('/hub');
    queue.onBackground();
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].session).toBe('session-1');

    advance(500);
    queue.onForeground();
    expect(queue.sessionId).toBe('session-1');

    queue.onBackground();
    advance(2000);
    queue.onForeground();
    expect(queue.sessionId).toBe('session-2');
    // The new session opens with the screen the person is on.
    await queue.flush();
    expect(sent.at(-1)?.events.map((e) => e.name)).toEqual(['/hub']);
  });
});
