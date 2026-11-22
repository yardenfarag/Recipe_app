import { setAuthFailureReporter } from "@shared/lib/supabase/auth";
import { normalizeSupabaseUrl } from "@shared/lib/supabase/client";
import {
  createInteractionQueue,
  newSessionId,
  type InteractionEvent,
  type InteractionQueue,
  type SendBatch,
} from "@shared/lib/interactionQueue";

import { ACTIVITY_PLATFORM, APP_VERSION } from "@/lib/activity/appInfo";
import { getVisitorId } from "@/lib/activity/visitorId";

/**
 * The activity log of the new web app: page views, presses, sign-ins and sign-ups for the admin Activity page
 * (ADR 020), through the same queue as the mobile app (shared/lib/interactionQueue.ts).
 *
 * - A press is a synchronous push onto an in-memory array; nothing in the click path waits, renders or stores.
 * - Batches of up to 50 go out after 10 s of quiet or when 50 are waiting, and whatever is waiting goes out when the
 *   tab is hidden or the page is left, with `fetch(…, { keepalive: true })` so it survives the page closing.
 * - The session id lives in the tab's sessionStorage, so a reload or a sign-in redirect (Google) keeps it: the
 *   visitor's rows before sign-in (visitor id) and after (account) share one session. A new one starts after
 *   30 minutes hidden, as on mobile.
 * - Names are fixed ids. Never put a title, an email or anything typed into a name or a property.
 *
 * Off in unit tests (NODE_ENV "test") and on the server.
 */

export type ActivityAuth = { accessToken: string } | null;

type SenderConfig = {
  url: string;
  key: string;
  getAuth: () => ActivityAuth;
  getVisitorId: () => string;
  fetch?: typeof fetch;
};

/** Error codes of a payload the database refused; sending it again would fail again. */
const REJECTED_CODES = new Set(["22023", "23514"]);

/**
 * Sends one batch to `log_interaction_events` with a keepalive request. Not supabase-js: its calls can't ask for
 * keepalive, and the last batch is sent while the page is going away.
 */
export function createBatchSender(config: SenderConfig): SendBatch {
  const base = normalizeSupabaseUrl(config.url) ?? "";
  return async (sessionId, events) => {
    const auth = config.getAuth();
    const response = await (config.fetch ?? fetch)(`${base}/rest/v1/rpc/log_interaction_events`, {
      method: "POST",
      keepalive: true,
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${auth?.accessToken ?? config.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_session_id: sessionId,
        // Ignored by the server when signed in (the account comes from the token); kept for the rows before.
        p_guest_install_id: config.getVisitorId(),
        p_platform: ACTIVITY_PLATFORM,
        p_app_version: APP_VERSION,
        p_events: events.map(({ kind, name, screen, at, properties }) => ({
          kind,
          name,
          screen,
          at,
          properties: properties ?? {},
        })),
      }),
    });
    if (response.ok) return;
    if (response.status === 400) {
      const body = (await response.json().catch(() => null)) as { code?: string } | null;
      // A refused payload won't succeed on retry; only network errors and an expired token are worth one.
      if (body?.code && REJECTED_CODES.has(body.code)) return;
    }
    throw new Error(`log_interaction_events failed (${response.status})`);
  };
}

const SESSION_KEY = "pinch.activity.session";
const SESSION_IDLE_MS = 30 * 60_000;

type SessionStore = Pick<Storage, "getItem" | "setItem">;

/** The session this tab was in, when it was hidden less than 30 minutes ago (a reload, a sign-in redirect). */
export function restoreSessionId(store: SessionStore | null, now: number): string | null {
  try {
    const saved = JSON.parse(store?.getItem(SESSION_KEY) ?? "null") as { id?: unknown; hiddenAt?: unknown } | null;
    if (typeof saved?.id !== "string" || typeof saved.hiddenAt !== "number") return null;
    return now - saved.hiddenAt < SESSION_IDLE_MS && saved.hiddenAt <= now ? saved.id : null;
  } catch {
    return null;
  }
}

export function saveSessionId(store: SessionStore | null, id: string, now: number): void {
  try {
    store?.setItem(SESSION_KEY, JSON.stringify({ id, hiddenAt: now }));
  } catch {
    // Storage blocked: the next page load starts a new session.
  }
}

export type ActivityLogOptions = {
  send: SendBatch;
  sessionStore: SessionStore | null;
  now?: () => number;
};

/** The queue plus what the browser adds: the session kept across page loads in the tab. */
export function createActivityLog({ send, sessionStore, now = Date.now }: ActivityLogOptions) {
  let restored = restoreSessionId(sessionStore, now());
  const queue: InteractionQueue = createInteractionQueue({
    send,
    now,
    newSessionId: () => {
      const id = restored ?? newSessionId();
      restored = null;
      return id;
    },
  });
  return {
    queue,
    /** The tab was hidden or the page is going away: send what is waiting and remember the session. */
    hidden() {
      saveSessionId(sessionStore, queue.sessionId, now());
      queue.onBackground();
    },
    visible() {
      queue.onForeground();
    },
  };
}

// ---------------------------------------------------------------------------
// The app's one log

let auth: ActivityAuth = null;
let log: ReturnType<typeof createActivityLog> | null = null;

function enabled(): boolean {
  return typeof window !== "undefined" && process.env.NODE_ENV !== "test";
}

function sessionStorageOrNull(): SessionStore | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function instance() {
  if (!enabled()) return null;
  if (!log) {
    log = createActivityLog({
      send: createBatchSender({
        // Written out in full so Next inlines them into the browser bundle.
        url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
        key: process.env.NEXT_PUBLIC_SUPABASE_KEY ?? "",
        getAuth: () => auth,
        getVisitorId,
      }),
      sessionStore: sessionStorageOrNull(),
    });
  }
  return log;
}

/** Logging must never break what the person was doing. */
function safely(run: () => void) {
  try {
    run();
  } catch {
    // Dropped.
  }
}

/** Who the rows belong to. AuthProvider calls it with every session change (sign-in, token refresh, sign-out). */
export function setActivityAuth(next: ActivityAuth): void {
  auth = next;
}

/** A press: "recipe.save", "settings.share_app". Buttons with a `trackId` do this themselves. */
export function logTap(id: string, properties?: InteractionEvent["properties"]): void {
  safely(() => instance()?.queue.tap(id, properties));
}

/** A page view, by screen name (lib/activity/screenName.ts). Repeats of the same page are ignored. */
export function logScreen(name: string): void {
  safely(() => instance()?.queue.screen(name));
}

/** "auth.login", "auth.signup", "auth.logout", "auth.signin_failed" … */
export function logAuth(name: string, properties?: InteractionEvent["properties"]): void {
  safely(() => instance()?.queue.auth(name, properties));
}

/**
 * Sends whatever is queued now, e.g. before signing out changes who the rows belong to. Waits at most `timeoutMs`,
 * so a slow network never holds up what comes next. Never rejects.
 */
export function flushActivity(timeoutMs = 2000): Promise<void> {
  const current = instance();
  if (!current) return Promise.resolve();
  return Promise.race([
    current.queue.flush().catch(() => {}),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

let started = false;

/**
 * Starts the browser side: sends on page hide, notices coming back, and logs failed sign-ins with Supabase's error
 * code only. ActivityTracker calls it once; calling it again does nothing.
 */
export function startActivityLog(): void {
  if (started || !enabled()) return;
  started = true;
  const onVisibility = () => {
    if (document.visibilityState === "hidden") instance()?.hidden();
    else instance()?.visible();
  };
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", () => instance()?.hidden());
  // Supabase's error code only (e.g. invalid_credentials), never the email or the message.
  setAuthFailureReporter((action, reason) => logAuth(`auth.${action}_failed`, { reason }));
}
