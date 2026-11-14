/**
 * In-memory queue for interaction events (screen views and taps).
 *
 * Logging must never slow the UI: `push` is a synchronous array append, no
 * React state, no storage, no network. Events go out in batches, either after
 * `flushDelayMs` of quiet or as soon as `batchSize` are waiting. A failed send
 * puts the batch back once, then drops it. The queue is capped so a dead
 * network can't grow memory.
 */

export type InteractionKind = 'screen' | 'tap' | 'auth';

export type InteractionEvent = {
  kind: InteractionKind;
  name: string;
  screen: string | null;
  at: string;
  properties?: Record<string, string | number | boolean>;
};

export type SendBatch = (sessionId: string, events: InteractionEvent[]) => Promise<void>;

export type InteractionQueueOptions = {
  send: SendBatch;
  newSessionId: () => string;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  batchSize?: number;
  maxQueued?: number;
  flushDelayMs?: number;
  /** A new session starts when the app comes back after this long away. */
  sessionIdleMs?: number;
};

// Same character set the database accepts (interaction_events.name).
const NAME_PATTERN = /^[A-Za-z0-9_.:/()[\]-]{1,120}$/;

export function sanitizeEventName(raw: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9_.:/()[\]-]/g, '_').slice(0, 120);
  return NAME_PATTERN.test(cleaned) ? cleaned : 'unnamed';
}

export function createInteractionQueue(options: InteractionQueueOptions) {
  const {
    send,
    newSessionId,
    now = Date.now,
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    batchSize = 50,
    maxQueued = 500,
    flushDelayMs = 10_000,
    sessionIdleMs = 30 * 60_000,
  } = options;

  let queue: (InteractionEvent & { retried?: boolean })[] = [];
  let sessionId = newSessionId();
  let currentScreen: string | null = null;
  let timer: unknown = null;
  let inFlight: Promise<void> | null = null;
  let backgroundedAt: number | null = null;

  function schedule() {
    if (timer !== null || inFlight) return;
    timer = setTimer(() => {
      timer = null;
      void flush();
    }, flushDelayMs);
  }

  function enqueue(event: InteractionEvent) {
    queue.push(event);
    if (queue.length > maxQueued) queue.splice(0, queue.length - maxQueued);
    if (queue.length >= batchSize) void flush();
    else schedule();
  }

  async function flush(): Promise<void> {
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
    if (inFlight) return inFlight;
    if (queue.length === 0) return;

    const batch = queue.splice(0, batchSize);
    const batchSession = sessionId;
    inFlight = (async () => {
      try {
        await send(batchSession, batch);
      } catch {
        const retry = batch.filter((event) => !event.retried).map((e) => ({ ...e, retried: true }));
        queue = [...retry, ...queue].slice(-maxQueued);
      } finally {
        inFlight = null;
      }
    })();
    await inFlight;
    if (queue.length >= batchSize) void flush();
    else if (queue.length > 0) schedule();
  }

  function screen(route: string) {
    const name = sanitizeEventName(route);
    if (name === currentScreen) return;
    currentScreen = name;
    enqueue({ kind: 'screen', name, screen: null, at: new Date(now()).toISOString() });
  }

  return {
    /** Records a screen view. Repeats of the same screen are ignored. */
    screen,
    tap(id: string, properties?: InteractionEvent['properties']) {
      enqueue({
        kind: 'tap',
        name: sanitizeEventName(id),
        screen: currentScreen,
        at: new Date(now()).toISOString(),
        ...(properties ? { properties } : null),
      });
    },
    /** Login, signup, logout and their failures. */
    auth(name: string, properties?: InteractionEvent['properties']) {
      enqueue({
        kind: 'auth',
        name: sanitizeEventName(name),
        screen: currentScreen,
        at: new Date(now()).toISOString(),
        ...(properties ? { properties } : null),
      });
    },
    flush,
    /** Call when the app goes to the background: sends what's waiting now. */
    onBackground() {
      backgroundedAt = now();
      void flush();
    },
    onForeground() {
      if (backgroundedAt !== null && now() - backgroundedAt >= sessionIdleMs) {
        sessionId = newSessionId();
        const last = currentScreen;
        currentScreen = null;
        if (last) screen(last);
      }
      backgroundedAt = null;
    },
    get sessionId() {
      return sessionId;
    },
    get size() {
      return queue.length;
    },
  };
}

export type InteractionQueue = ReturnType<typeof createInteractionQueue>;
