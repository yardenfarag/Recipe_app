/**
 * Keeps theme, language and spoons-or-grams on the signed-in account (PIN-154), for both apps.
 *
 * One store per app follows the session and holds what the account has saved. Each app's providers keep their own
 * device copy (AsyncStorage, localStorage) for the first paint and for signed-out use, and let the account's value
 * win once it is known. See `../userPreferences.ts` for where the values live in `user_metadata`.
 *
 * - On start and on each sign-in the account is read fresh from the server (`getUser`). Until then the stored
 *   session's copy stands in, so a fresh sign-in applies its choices at once.
 * - TOKEN_REFRESHED and USER_UPDATED carry the server's copy, so a change made on another device arrives with the next
 *   token refresh too. `refresh()` re-reads on demand (app back in front), at most once a minute.
 * - `save` is for a choice made on this device. Applying the account's value never calls it, so loading doesn't write.
 * - First sync: once the account is read, anything this device chose (`reportDevice`) that the account lacks is saved.
 * - A choice not yet confirmed by the server (a reload right after picking, or offline) is kept on the device
 *   (`unsaved`) and sent again on the next start, so it isn't lost to the account's older value.
 * - Signing out clears the store, not the devices' copies.
 *
 * Calls into supabase-js are deferred out of auth callbacks (calling it inside one deadlocks).
 */
import type { AuthChangeEvent, Session, SupabaseClient, User } from '@supabase/supabase-js';

import {
  applyMetadataUpdate,
  cleanPreferences,
  hasPreferences,
  missingFromAccount,
  preferencesUpdate,
  readAccountPreferences,
  samePreferences,
  type PreferenceKey,
  type UserPreferences,
} from '../userPreferences';

/** The parts of the Supabase client this needs. */
export interface PreferencesClient {
  auth: Pick<SupabaseClient['auth'], 'onAuthStateChange' | 'getUser' | 'updateUser'>;
}

export interface AccountPreferencesSnapshot {
  /** The signed-in account, or null (signed out, or not known yet). */
  userId: string | null;
  /** True once the account was read from the server, or there is no account. */
  loaded: boolean;
  /** What the account holds, as far as is known. Empty when signed out. */
  prefs: UserPreferences;
}

/** Before the session is known (and on the server). */
export const UNKNOWN_ACCOUNT_PREFERENCES: AccountPreferencesSnapshot = Object.freeze({
  userId: null,
  loaded: false,
  prefs: Object.freeze({}),
}) as AccountPreferencesSnapshot;

export interface AccountPreferencesSync {
  subscribe(listener: () => void): () => void;
  getSnapshot(): AccountPreferencesSnapshot;
  /** A choice made on this device: remembered as the device's, and saved on the account when signed in. */
  save(changes: UserPreferences): void;
  /** What this device chose before (its stored copy). Fills what the account lacks on first sync. */
  reportDevice(values: UserPreferences): void;
  /** Re-reads the account from the server, at most once a minute. */
  refresh(): void;
  /** Starts following the session. `subscribe` starts it too. */
  start(): void;
  stop(): void;
}

/** Choices made on this device that the account hadn't confirmed yet, for whose account. */
export interface UnsavedPreferences {
  userId: string;
  prefs: UserPreferences;
}

/** Reads a stored `UnsavedPreferences` (JSON), or null for anything else. */
export function parseUnsavedPreferences(raw: string | null | undefined): UnsavedPreferences | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const { userId, prefs } = value as { userId?: unknown; prefs?: unknown };
    if (typeof userId !== 'string' || !userId) return null;
    const clean = cleanPreferences(prefs);
    return hasPreferences(clean) ? { userId, prefs: clean } : null;
  } catch {
    return null;
  }
}

/** The device key both apps keep unconfirmed choices under. */
export const UNSAVED_PREFERENCES_KEY = 'pinch:prefsUnsaved';

export interface AccountPreferencesSyncOptions {
  /**
   * Where this device keeps choices the server hasn't confirmed yet (localStorage, AsyncStorage). Without it, a
   * reload in the moment between picking and saving loses the pick.
   */
  unsaved?: {
    read(): UnsavedPreferences | null | Promise<UnsavedPreferences | null>;
    write(value: UnsavedPreferences | null): void;
  };
  /** How calls are moved out of auth callbacks. Default: setTimeout 0. */
  defer?: (run: () => void) => void;
  now?: () => number;
}

const REFRESH_INTERVAL_MS = 60_000;

function asMetadata(user: Pick<User, 'user_metadata'> | null | undefined): Record<string, unknown> {
  const metadata = user?.user_metadata;
  return typeof metadata === 'object' && metadata !== null && !Array.isArray(metadata) ? metadata : {};
}

export function createAccountPreferencesSync(
  client: PreferencesClient,
  options: AccountPreferencesSyncOptions = {},
): AccountPreferencesSync {
  const defer = options.defer ?? ((run: () => void) => void setTimeout(run, 0));
  const now = options.now ?? Date.now;

  let snapshot = UNKNOWN_ACCOUNT_PREFERENCES;
  let metadata: Record<string, unknown> = {};
  let device: UserPreferences = {};
  /** Bumped on every change of account, so late answers for the previous one are dropped. */
  let generation = 0;
  let pendingWrites = 0;
  let writeCount = 0;
  let queue: Promise<void> = Promise.resolve();
  let lastLoadAt = -Infinity;
  let backfillTried = new Set<PreferenceKey>();
  /** Saved on this device, not yet confirmed by the server. */
  let unsaved: UserPreferences = {};
  let unsubscribeAuth: (() => void) | null = null;
  const listeners = new Set<() => void>();

  function publish(next: AccountPreferencesSnapshot) {
    const prefs = samePreferences(next.prefs, snapshot.prefs) ? snapshot.prefs : next.prefs;
    if (next.userId === snapshot.userId && next.loaded === snapshot.loaded && prefs === snapshot.prefs) return;
    snapshot = { userId: next.userId, loaded: next.loaded, prefs };
    for (const listener of [...listeners]) listener();
  }

  function rememberUnsaved() {
    if (!options.unsaved) return;
    try {
      options.unsaved.write(snapshot.userId && hasPreferences(unsaved) ? { userId: snapshot.userId, prefs: unsaved } : null);
    } catch {
      // Storage blocked: the pick is still sent; only a reload before it lands would lose it.
    }
  }

  /** Drops the unsaved choices the server's copy now holds. */
  function confirmUnsaved(serverMetadata: Record<string, unknown>) {
    if (!hasPreferences(unsaved)) return;
    const onServer = readAccountPreferences(serverMetadata) as Record<string, unknown>;
    const left = Object.fromEntries(
      Object.entries(unsaved).filter(([key, value]) => onServer[key] !== value),
    ) as UserPreferences;
    if (samePreferences(left, unsaved)) return;
    unsaved = left;
    rememberUnsaved();
  }

  /** On start: a pick the server never confirmed (reload, offline) is sent again, and wins over the account's. */
  function resendUnsaved(userId: string, gen: number) {
    if (!options.unsaved) return;
    void Promise.resolve()
      .then(() => options.unsaved?.read())
      .catch(() => null)
      .then((stored) => {
        if (gen !== generation || !stored || stored.userId !== userId) return;
        const prefs = cleanPreferences(stored.prefs);
        if (!hasPreferences(prefs)) return;
        unsaved = { ...prefs, ...unsaved };
        device = { ...device, ...prefs };
        write(prefs);
      });
  }

  function adopt(nextMetadata: Record<string, unknown>) {
    metadata = nextMetadata;
    publish({ userId: snapshot.userId, loaded: true, prefs: readAccountPreferences(metadata) });
    backfill();
  }

  function backfill() {
    if (!snapshot.userId || !snapshot.loaded) return;
    const missing = missingFromAccount(snapshot.prefs, device) as Record<string, unknown>;
    for (const key of backfillTried) delete missing[key];
    if (!hasPreferences(missing)) return;
    for (const key of Object.keys(missing)) backfillTried.add(key as PreferenceKey);
    write(missing);
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
          if (writeCount !== writesBefore || pendingWrites > 0) {
            publish({ ...snapshot, loaded: true });
            backfill();
            return;
          }
          adopt(asMetadata(data.user));
        } catch (error) {
          // Offline or similar: keep the stored session's copy and try again on the next refresh.
          lastLoadAt = -Infinity;
          console.warn('[prefs] could not read the account', error instanceof Error ? error.message : error);
        }
      })();
    });
  }

  function write(changes: UserPreferences) {
    if (!snapshot.userId) return;
    const data = preferencesUpdate(metadata, changes);
    if (!data) {
      // Already what the account holds: nothing to send, and nothing left unsaved.
      confirmUnsaved(metadata);
      return;
    }
    // Shown at once; the server's answer replaces it.
    metadata = applyMetadataUpdate(metadata, data);
    publish({ ...snapshot, prefs: readAccountPreferences(metadata) });

    const gen = generation;
    pendingWrites += 1;
    writeCount += 1;
    let answer: Record<string, unknown> | null = null;
    queue = queue
      .then(() => new Promise<void>((resolve) => defer(resolve)))
      .then(async () => {
        if (gen !== generation) return;
        try {
          const { data: result, error } = await client.auth.updateUser({ data });
          if (error) throw error;
          if (result.user) answer = asMetadata(result.user);
        } catch (error) {
          console.warn('[prefs] could not save on the account', error instanceof Error ? error.message : error);
        }
      })
      .then(() => {
        pendingWrites -= 1;
        // Only the last write's answer counts: earlier ones miss the later changes.
        if (answer && pendingWrites === 0 && gen === generation) {
          confirmUnsaved(answer);
          adopt(answer);
        }
      });
  }

  function onAuth(event: AuthChangeEvent, session: Session | null) {
    const user = session?.user ?? null;
    if (!user) {
      if (snapshot.userId !== null || !snapshot.loaded) generation += 1;
      metadata = {};
      backfillTried = new Set();
      // Kept on the device for that account; only forgotten here.
      unsaved = {};
      publish({ userId: null, loaded: true, prefs: {} });
      return;
    }
    if (user.id !== snapshot.userId) {
      generation += 1;
      backfillTried = new Set();
      metadata = asMetadata(user);
      // The stored session's copy until the server answers (it may be a little old).
      unsaved = {};
      publish({ userId: user.id, loaded: false, prefs: readAccountPreferences(metadata) });
      load();
      resendUnsaved(user.id, generation);
      return;
    }
    // Both carry the server's copy. While this device is saving, its own answer is the newer one.
    if ((event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') && pendingWrites === 0) {
      adopt(asMetadata(user));
    }
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
    save(changes) {
      const clean = cleanPreferences(changes);
      device = { ...device, ...clean };
      if (snapshot.userId && hasPreferences(clean)) {
        unsaved = { ...unsaved, ...clean };
        rememberUnsaved();
      }
      write(clean);
    },
    reportDevice(values) {
      device = { ...device, ...cleanPreferences(values) };
      backfill();
    },
    refresh() {
      if (now() - lastLoadAt < REFRESH_INTERVAL_MS) return;
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
