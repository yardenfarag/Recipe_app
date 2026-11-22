import {
  applyMessageEvent,
  nextMessageToShow,
  type ClickedButton,
  type InAppMessage,
  type MessageEvent,
  type MessagePlatform,
  type MessageReceipt,
} from './inAppMessages';

/**
 * What the app holds about in-app messages for the signed-in user, and the
 * rules for which one is on screen. Plain TypeScript, no React and no
 * Supabase, so the choosing and recording can be tested with fakes. Each app
 * wires it to the real server calls: the mobile app in
 * `src/hooks/useInAppMessages.ts`, the web app in
 * `web/components/inAppMessages/controller.ts`.
 */

export type FetchParams = {
  platform: MessagePlatform;
  appVersion: string | null;
  language: string;
};

export type ControllerDeps = {
  fetchMessages: (params: FetchParams) => Promise<{
    messages: InAppMessage[];
    receipts: Record<string, MessageReceipt>;
  }>;
  recordEvent: (messageId: string, event: MessageEvent, button?: ClickedButton) => Promise<void>;
  now?: () => number;
  /** When this launch began; "every launch" messages are due again after it. */
  launchedAt?: number;
  /** A refresh sooner than this after the last one is skipped unless forced. */
  minRefreshIntervalMs?: number;
  /** Pause before a message that follows another one, so two dialogs never overlap. */
  chainGapMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  /**
   * Keeps the ids closed this launch beyond this JS context. On web a launch
   * is the browser tab, and a reload must not bring a closed message back.
   */
  closedStore?: { load: () => string[]; save: (ids: string[]) => void };
  /**
   * Routes where a banner may be chosen and counted as seen. Defaults to the
   * mobile tabs (`isTabsRoute`): a screen pushed over the tabs hides the banner
   * slot. The web app draws its banner slot on every signed-in page.
   */
  canShowBanner?: (route: string | null) => boolean;
};

export type MessagesSnapshot = {
  /** The message on screen now, or null. */
  active: InAppMessage | null;
};

type Listener = () => void;

/** Screens a signed-out person sees. A message chosen at sign-in waits until the user leaves them. */
const SIGNED_OUT_SCREENS = new Set(['auth', 'welcome', 'onboarding', 'reset-password', 'auth-callback']);

/** The raw route (group segments included, e.g. `/auth`) is one of the signed-out screens. */
export function isSignedOutRoute(route: string | null): boolean {
  if (!route) return false;
  const first = route.split('/').find((part) => part !== '') ?? '';
  return SIGNED_OUT_SCREENS.has(first.split('?')[0] ?? '');
}

/** The raw route is a tabs route. `matchesScreen` drops `(group)` segments, so this checks the raw string. */
export function isTabsRoute(route: string | null): boolean {
  return route === '/(tabs)' || (route?.startsWith('/(tabs)/') ?? false);
}

/** A banner is drawn only inside the tabs; a required message is always full screen. */
function isBannerMessage(message: InAppMessage): boolean {
  return message.presentation === 'banner' && !message.required;
}

/** The later of two ISO times (either may be null). */
function later(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

/**
 * The server's receipt and the one held here can differ for a moment (an
 * event still on its way). Keep whichever is further along, per field.
 */
export function mergeReceipt(server: MessageReceipt | undefined, local: MessageReceipt | undefined): MessageReceipt | undefined {
  if (!server) return local;
  if (!local) return server;
  const clickedAt = later(server.clickedAt, local.clickedAt);
  const localClickedLater = clickedAt === local.clickedAt && local.clickedAt !== server.clickedAt;
  return {
    messageId: server.messageId,
    firstSeenAt: server.firstSeenAt ?? local.firstSeenAt,
    lastSeenAt: later(server.lastSeenAt, local.lastSeenAt),
    seenCount: Math.max(server.seenCount, local.seenCount),
    dismissedAt: later(server.dismissedAt, local.dismissedAt),
    clickedAt,
    clickedButton: localClickedLater ? local.clickedButton : server.clickedButton,
  };
}

export function createMessagesController(deps: ControllerDeps) {
  const now = deps.now ?? (() => Date.now());
  const minRefreshIntervalMs = deps.minRefreshIntervalMs ?? 30_000;
  const chainGapMs = deps.chainGapMs ?? 400;
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const launchedAt = deps.launchedAt ?? now();
  const bannerRoute = deps.canShowBanner ?? isTabsRoute;

  let userId: string | null = null;
  /** Bumped when the user changes, so a fetch that was in flight for the old user is ignored. */
  let generation = 0;
  let messages: InAppMessage[] = [];
  let receipts: Record<string, MessageReceipt> = {};
  let route: string | null = null;
  let active: InAppMessage | null = null;
  /** The active message's presenter reported it is really on screen (a modal's onShow, the alert call, the banner mounted). */
  let shown = false;
  let seenRecorded = false;
  /** True while `active` is a sample being previewed: nothing is recorded for it. */
  let previewing = false;
  /** Messages closed during this launch; they don't come back until the next one. */
  const closedThisLaunch = new Set<string>(deps.closedStore?.load() ?? []);
  const saveClosed = () => deps.closedStore?.save([...closedThisLaunch]);
  let pending: { id: string; handle: unknown } | null = null;
  let lastFetchAt = 0;
  let inFlight: Promise<void> | null = null;
  let snapshot: MessagesSnapshot = { active: null };
  const listeners = new Set<Listener>();

  function emit() {
    if (snapshot.active === active) return;
    snapshot = { active };
    for (const listener of [...listeners]) listener();
  }

  function cancelPending() {
    if (pending) clearTimer(pending.handle);
    pending = null;
  }

  function record(messageId: string, event: MessageEvent, button?: ClickedButton) {
    receipts = {
      ...receipts,
      [messageId]: applyMessageEvent(messageId, receipts[messageId], event, now(), button),
    };
    // A failed write is silent: the next fetch brings the server's truth back.
    void deps.recordEvent(messageId, event, button).catch(() => {});
  }

  /** The messages that may be chosen now: not closed this launch, and a banner only where its slot shows (`canShowBanner`). */
  function candidates(): InAppMessage[] {
    return messages.filter((m) => !closedThisLaunch.has(m.id) && (!isBannerMessage(m) || bannerRoute(route)));
  }

  function clearActive() {
    active = null;
    shown = false;
    seenRecorded = false;
  }

  /** Record `seen` once the message is really on screen (a banner also needs a route where its slot shows). */
  function recordSeenIfShown() {
    if (!active || previewing || seenRecorded || !shown) return;
    if (isBannerMessage(active) && !bannerRoute(route)) return;
    seenRecorded = true;
    record(active.id, 'seen');
  }

  function activate(message: InAppMessage) {
    cancelPending();
    active = message;
    shown = false;
    seenRecorded = false;
    previewing = false;
    emit();
  }

  /** Decide what should be on screen. `afterClose` leaves a short gap after a dialog was just closed. */
  function evaluate(afterClose = false) {
    if (userId === null || previewing) return;

    if (active) {
      const current = messages.find((m) => m.id === active?.id);
      if (!current) {
        // Stopped, ended or no longer targeting this user: it goes away at this fetch.
        clearActive();
      } else {
        active = current;
        const candidate = nextMessageToShow(candidates(), receipts, route, now(), { launchedAt });
        // A required message (an update prompt) takes over from an optional one.
        if (candidate && candidate.required && !active.required && candidate.id !== active.id) {
          clearActive();
        } else {
          emit();
          return;
        }
      }
    }

    // Nothing new while the sign-in screens are up; it appears once the user lands in the app.
    const next = isSignedOutRoute(route) ? null : nextMessageToShow(candidates(), receipts, route, now(), { launchedAt });
    if (!next) {
      cancelPending();
      emit();
      return;
    }
    emit();
    if (pending?.id === next.id) return;
    cancelPending();
    const wait = Math.max((next.delaySeconds ?? 0) * 1000, afterClose ? chainGapMs : 0);
    if (wait <= 0) {
      activate(next);
      return;
    }
    const id = next.id;
    pending = {
      id,
      handle: setTimer(() => {
        pending = null;
        const still = messages.find((m) => m.id === id);
        const placeable = still && (!isBannerMessage(still) || bannerRoute(route)) && !isSignedOutRoute(route);
        if (still && placeable && !active && userId !== null) activate(still);
      }, wait),
    };
  }

  function close(messageId: string) {
    if (!active || active.id !== messageId) return;
    if (!previewing) {
      closedThisLaunch.add(messageId);
      saveClosed();
    }
    const wasPreview = previewing;
    clearActive();
    previewing = false;
    emit();
    if (!wasPreview) evaluate(true);
  }

  return {
    subscribe(listener: Listener): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot(): MessagesSnapshot {
      return snapshot;
    },

    /** Who is signed in. A different user (or nobody) clears everything held. */
    setUser(next: string | null) {
      if (next === userId) return;
      // Restoring the session at launch (nobody, then the same user as before a reload) keeps what was closed.
      const restoring = userId === null && next !== null;
      userId = next;
      generation += 1;
      messages = [];
      receipts = {};
      if (!restoring) {
        closedThisLaunch.clear();
        saveClosed();
      }
      lastFetchAt = 0;
      inFlight = null;
      cancelPending();
      // A dev sample opened from the URL is activated before the session resolves; the user change must not wipe it.
      if (!previewing) clearActive();
      emit();
    },

    /** The current screen's route, so messages limited to certain screens can wait for them. */
    setRoute(next: string | null) {
      if (next === route) return;
      route = next;
      evaluate();
      // A banner waiting under a pushed screen is recorded once the tabs are back.
      recordSeenIfShown();
    },

    /**
     * The presenter reports the active message is really on screen: a modal's
     * `onShow`, the call to `Alert.alert`, or a mounted banner. Only then is
     * `seen` recorded. An iOS modal that could not be presented over another
     * modal never reports, so it is not counted.
     */
    reportShown(messageId: string) {
      if (!active || active.id !== messageId) return;
      shown = true;
      recordSeenIfShown();
    },

    /**
     * Admin-only way out of a message for the rest of this launch. Records
     * nothing (not even `dismissed`), so the message still counts as unanswered
     * and comes back on the next launch.
     */
    hideForThisLaunch(messageId: string) {
      close(messageId);
    },

    /** Fetch the messages for the signed-in user. Silent on failure. Does nothing when nobody is signed in. */
    refresh(params: FetchParams, options: { force?: boolean } = {}): Promise<void> {
      if (userId === null) return Promise.resolve();
      if (inFlight) return inFlight;
      if (!options.force && lastFetchAt > 0 && now() - lastFetchAt < minRefreshIntervalMs) {
        return Promise.resolve();
      }
      const startedFor = generation;
      const run = (async () => {
        try {
          const fetched = await deps.fetchMessages(params);
          if (startedFor !== generation) return;
          const merged: Record<string, MessageReceipt> = {};
          for (const message of fetched.messages) {
            const receipt = mergeReceipt(fetched.receipts[message.id], receipts[message.id]);
            if (receipt) merged[message.id] = receipt;
          }
          messages = fetched.messages;
          receipts = merged;
          lastFetchAt = now();
          evaluate();
        } catch {
          // A failed fetch is silent; the next launch or return to the foreground tries again.
        } finally {
          if (startedFor === generation) inFlight = null;
        }
      })();
      inFlight = run;
      return run;
    },

    /** The user closed the message (close button, back, backdrop, a "dismiss" button). Ignored for a required message. */
    dismiss(messageId: string) {
      if (!active || active.id !== messageId || active.required) return;
      if (!previewing) record(messageId, 'dismissed');
      close(messageId);
    },

    /**
     * The user tapped a button or the link. Recorded as clicked; the message
     * then closes, except a required one, which stays until targeting stops
     * matching (for example after the update).
     */
    press(messageId: string, button: ClickedButton) {
      if (!active || active.id !== messageId) return;
      if (!previewing) record(messageId, 'clicked', button);
      if (!active.required) close(messageId);
    },

    /** Show a sample in dev: nothing is recorded for it. Pass null to clear. */
    preview(message: InAppMessage | null) {
      cancelPending();
      if (message) {
        previewing = true;
        active = message;
        emit();
      } else {
        previewing = false;
        clearActive();
        emit();
        evaluate();
      }
    },

    /** For tests and diagnostics. */
    peekReceipt(messageId: string): MessageReceipt | undefined {
      return receipts[messageId];
    },
  };
}

export type MessagesController = ReturnType<typeof createMessagesController>;
