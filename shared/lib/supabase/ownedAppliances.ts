/**
 * Keeps "My appliances" (PIN-155) on the signed-in account, for both apps. See `../ownedAppliances.ts` for where the
 * list lives in `user_metadata` and what "not set" means.
 *
 * One store per app follows the session:
 * - On start and on each sign-in the account is read fresh from the server (`getUser`). Until then the stored
 *   session's copy stands in, so the recipe page can check the kitchen at once.
 * - TOKEN_REFRESHED and USER_UPDATED carry the server's copy, so a list ticked on the other device arrives with the
 *   next token refresh. `refresh()` re-reads on demand (Settings opened, app or tab back in front), at most once every
 *   `REFRESH_INTERVAL_MS` unless forced.
 * - `save` shows the new list at once and sends it. Quick taps are queued and only the latest is sent. If it can't be
 *   saved, the list goes back to the account's last known copy and `status` says "failed".
 * - Signing out forgets the list (the account keeps it).
 *
 * Calls into supabase-js are deferred out of auth callbacks (calling it inside one deadlocks).
 */
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';

import type { ApplianceKey } from '../appliances';
import {
  clearOwnedAppliancesUpdate,
  ownedAppliancesUpdate,
  readOwnedAppliances,
  sameKitchenAppliances,
  type KitchenAppliances,
} from '../ownedAppliances';
import type { PreferencesClient } from './userPreferences';

export type OwnedAppliancesStatus = 'idle' | 'saving' | 'saved' | 'failed';

export interface OwnedAppliancesSnapshot {
  /** The signed-in account, or null (signed out, or not known yet). */
  userId: string | null;
  /** True once the account was read from the server, or there is no account. */
  loaded: boolean;
  /** The cook's list, or null when they never saved one (recipes don't check the kitchen). */
  kitchen: KitchenAppliances | null;
  /** The last save on this device. */
  status: OwnedAppliancesStatus;
}

/** Before the session is known (and on the server). */
export const UNKNOWN_OWNED_APPLIANCES: OwnedAppliancesSnapshot = Object.freeze({
  userId: null,
  loaded: false,
  kitchen: null,
  status: 'idle',
}) as OwnedAppliancesSnapshot;

export interface OwnedAppliancesSync {
  subscribe(listener: () => void): () => void;
  getSnapshot(): OwnedAppliancesSnapshot;
  /** Saves the ticked appliances as the cook's kitchen. Everything not ticked is saved as not owned. */
  save(ticked: ApplianceKey[]): void;
  /** Forgets the list, so recipes stop checking the kitchen. */
  clear(): void;
  /** Re-reads the account from the server. Throttled unless `force`. */
  refresh(options?: { force?: boolean }): void;
  start(): void;
  stop(): void;
}

export interface OwnedAppliancesSyncOptions {
  /** How calls are moved out of auth callbacks. Default: setTimeout 0. */
  defer?: (run: () => void) => void;
  now?: () => number;
}

export const OWNED_APPLIANCES_REFRESH_INTERVAL_MS = 30_000;

function asMetadata(user: Pick<User, 'user_metadata'> | null | undefined): Record<string, unknown> {
  const metadata = user?.user_metadata;
  return typeof metadata === 'object' && metadata !== null && !Array.isArray(metadata) ? metadata : {};
}

export function createOwnedAppliancesSync(
  client: PreferencesClient,
  options: OwnedAppliancesSyncOptions = {},
): OwnedAppliancesSync {
  const defer = options.defer ?? ((run: () => void) => void setTimeout(run, 0));
  const now = options.now ?? Date.now;

  let snapshot = UNKNOWN_OWNED_APPLIANCES;
  /** The account's metadata as last confirmed by the server (or the stored session). */
  let confirmed: Record<string, unknown> = {};
  /** What to send next; replaced by each newer save. */
  let pending: Record<string, unknown> | null = null;
  let sending = false;
  /** Bumped on every change of account, so late answers for the previous one are dropped. */
  let generation = 0;
  let writeCount = 0;
  let lastLoadAt = -Infinity;
  let unsubscribeAuth: (() => void) | null = null;
  const listeners = new Set<() => void>();

  function publish(next: Partial<OwnedAppliancesSnapshot>) {
    const merged = { ...snapshot, ...next };
    const kitchen = sameKitchenAppliances(merged.kitchen, snapshot.kitchen) ? snapshot.kitchen : merged.kitchen;
    if (
      merged.userId === snapshot.userId &&
      merged.loaded === snapshot.loaded &&
      merged.status === snapshot.status &&
      kitchen === snapshot.kitchen
    ) {
      return;
    }
    snapshot = { ...merged, kitchen };
    for (const listener of [...listeners]) listener();
  }

  /** The server's copy: shown, unless this device is still sending a newer list. */
  function adopt(metadata: Record<string, unknown>) {
    confirmed = metadata;
    if (sending || pending) {
      publish({ loaded: true });
      return;
    }
    publish({ loaded: true, kitchen: readOwnedAppliances(metadata) });
  }

  function load() {
    if (!snapshot.userId) return;
    lastLoadAt = now();
    const gen = generation;
    const writesBefore = writeCount;
    defer(() => {
      if (gen !== generation) return;
      void (async () => {
        try {
          const { data, error } = await client.auth.getUser();
          if (gen !== generation) return;
          if (error || !data.user) throw error ?? new Error('no user');
          if (data.user.id !== snapshot.userId) return;
          // A save since the read began answers with a newer copy; don't step back to this one.
          if (writeCount !== writesBefore || sending || pending) {
            publish({ loaded: true });
            return;
          }
          adopt(asMetadata(data.user));
        } catch (error) {
          // Offline or similar: keep the stored session's copy and try again on the next refresh.
          lastLoadAt = -Infinity;
          publish({ loaded: true });
          console.warn('[appliances] could not read the account', error instanceof Error ? error.message : error);
        }
      })();
    });
  }

  function send() {
    if (sending || !pending || !snapshot.userId) return;
    sending = true;
    const gen = generation;
    const data = pending;
    pending = null;
    defer(() => {
      void (async () => {
        let answer: Record<string, unknown> | null = null;
        let failed = false;
        try {
          if (gen !== generation) return;
          const { data: result, error } = await client.auth.updateUser({ data });
          if (error) throw error;
          answer = result.user ? asMetadata(result.user) : { ...confirmed, ...data };
        } catch (error) {
          failed = true;
          console.warn('[appliances] could not save on the account', error instanceof Error ? error.message : error);
        } finally {
          sending = false;
        }
        if (gen !== generation) return;
        if (pending) {
          // A newer list was picked meanwhile: send that; its answer settles what is shown.
          if (answer) confirmed = answer;
          send();
          return;
        }
        if (failed) {
          // Back to what the account holds, so the screen never shows a list that isn't saved.
          publish({ status: 'failed', kitchen: readOwnedAppliances(confirmed) });
          return;
        }
        confirmed = answer ?? confirmed;
        publish({ status: 'saved', kitchen: readOwnedAppliances(confirmed) });
      })();
    });
  }

  function write(data: Record<string, unknown>) {
    if (!snapshot.userId) return;
    writeCount += 1;
    pending = data;
    publish({ status: 'saving', kitchen: readOwnedAppliances({ ...confirmed, ...data }) });
    send();
  }

  function onAuth(event: AuthChangeEvent, session: Session | null) {
    const user = session?.user ?? null;
    if (!user) {
      if (snapshot.userId !== null || !snapshot.loaded) generation += 1;
      confirmed = {};
      pending = null;
      publish({ userId: null, loaded: true, kitchen: null, status: 'idle' });
      return;
    }
    if (user.id !== snapshot.userId) {
      generation += 1;
      pending = null;
      sending = false;
      confirmed = asMetadata(user);
      // The stored session's copy until the server answers (it may be a little old).
      publish({ userId: user.id, loaded: false, kitchen: readOwnedAppliances(confirmed), status: 'idle' });
      load();
      return;
    }
    // Both carry the server's copy. While this device is saving, its own answer is the newer one.
    if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') adopt(asMetadata(user));
  }

  function start() {
    if (unsubscribeAuth) return;
    const { data } = client.auth.onAuthStateChange((event, session) => onAuth(event, session));
    unsubscribeAuth = () => data.subscription.unsubscribe();
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      start();
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    save(ticked) {
      write(ownedAppliancesUpdate({ ...confirmed, ...(pending ?? {}) }, ticked));
    },
    clear() {
      write(clearOwnedAppliancesUpdate());
    },
    refresh(refreshOptions) {
      if (!refreshOptions?.force && now() - lastLoadAt < OWNED_APPLIANCES_REFRESH_INTERVAL_MS) return;
      load();
    },
    start,
    stop() {
      unsubscribeAuth?.();
      unsubscribeAuth = null;
      listeners.clear();
    },
  };
}
