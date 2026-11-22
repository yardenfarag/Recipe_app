/**
 * On the web, one "launch" for in-app messages is the browser tab, not one page
 * load: a reload, or coming back from checkout or a sign-in redirect, would
 * otherwise count as a new launch and bring back a message the user just
 * closed. The tab's sessionStorage keeps when the launch began and which
 * messages were closed. Native apps pass no storage and keep the defaults (the
 * process is the launch). Used by the Expo web build (src/components/
 * inAppMessages/webLaunch.ts) and the Next.js web app.
 */

/** The part of `Storage` this needs; `window.sessionStorage` fits. */
export type TabStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const STARTED_KEY = 'pinch.inAppMessages.launchStartedAt';
const CLOSED_KEY = 'pinch.inAppMessages.closed';

/** When this tab's launch began; the first page load in the tab sets it. Undefined without storage. */
export function webLaunchStartedAt(now: number, store: TabStorage | null): number | undefined {
  if (!store) return undefined;
  try {
    const saved = Number(store.getItem(STARTED_KEY));
    if (Number.isFinite(saved) && saved > 0 && saved <= now) return saved;
    store.setItem(STARTED_KEY, String(now));
  } catch {
    // Storage blocked: this page load is the launch.
  }
  return now;
}

/** Where the controller keeps the ids closed this launch. Undefined without storage. */
export function webClosedStore(store: TabStorage | null) {
  if (!store) return undefined;
  return {
    load(): string[] {
      try {
        const parsed: unknown = JSON.parse(store.getItem(CLOSED_KEY) ?? '[]');
        return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
      } catch {
        return [];
      }
    },
    save(ids: string[]) {
      try {
        if (ids.length > 0) store.setItem(CLOSED_KEY, JSON.stringify(ids));
        else store.removeItem(CLOSED_KEY);
      } catch {
        // Storage blocked or full: closed messages last until this page load ends.
      }
    },
  };
}
