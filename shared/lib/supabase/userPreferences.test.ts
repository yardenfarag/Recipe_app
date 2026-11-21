import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createAccountPreferencesSync,
  parseUnsavedPreferences,
  type AccountPreferencesSyncOptions,
  type PreferencesClient,
  type UnsavedPreferences,
} from './userPreferences';

type Metadata = Record<string, unknown>;

function session(id: string, metadata: Metadata): Session {
  return { user: { id, user_metadata: metadata } } as unknown as Session;
}

async function flush() {
  for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

function setup(server: { metadata: Metadata }, extra: AccountPreferencesSyncOptions = {}) {
  let emit: (event: AuthChangeEvent, session: Session | null) => void = () => {};
  const unsubscribe = vi.fn();
  const auth = {
    onAuthStateChange: vi.fn((callback: typeof emit) => {
      emit = callback;
      return { data: { subscription: { unsubscribe } } };
    }),
    getUser: vi.fn(async () => ({ data: { user: { id: 'u1', user_metadata: { ...server.metadata } } }, error: null })),
    updateUser: vi.fn(async ({ data }: { data: Metadata }) => {
      server.metadata = { ...server.metadata, ...data };
      return { data: { user: { id: 'u1', user_metadata: { ...server.metadata } } }, error: null };
    }),
  };
  let time = 0;
  const sync = createAccountPreferencesSync({ auth } as unknown as PreferencesClient, { now: () => time, ...extra });
  const listener = vi.fn();
  sync.subscribe(listener);
  return {
    sync,
    auth,
    listener,
    emit: (event: AuthChangeEvent, s: Session | null) => emit(event, s),
    advance: (ms: number) => {
      time += ms;
    },
  };
}

describe('createAccountPreferencesSync', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('starts unknown, then reads the account fresh from the server', async () => {
    const server = { metadata: { locale: 'he', prefs: { scheme: 'dark' } } as Metadata };
    const { sync, emit, auth } = setup(server);
    expect(sync.getSnapshot()).toEqual({ userId: null, loaded: false, prefs: {} });

    // The stored session is a little old: it stands in until the server answers.
    emit('INITIAL_SESSION', session('u1', { locale: 'en' }));
    expect(sync.getSnapshot()).toEqual({ userId: 'u1', loaded: false, prefs: { language: 'en' } });
    expect(auth.getUser).not.toHaveBeenCalled(); // never inside the auth callback

    await flush();
    expect(auth.getUser).toHaveBeenCalledTimes(1);
    expect(sync.getSnapshot()).toEqual({ userId: 'u1', loaded: true, prefs: { language: 'he', scheme: 'dark' } });
    expect(auth.updateUser).not.toHaveBeenCalled(); // loading never writes
  });

  it('signed out is loaded with nothing', () => {
    const { sync, emit } = setup({ metadata: {} });
    emit('INITIAL_SESSION', null);
    expect(sync.getSnapshot()).toEqual({ userId: null, loaded: true, prefs: {} });
  });

  it('first sync saves what the device chose and the account lacks, once', async () => {
    const server = { metadata: { locale: 'he', prefs: { futureKey: true } } as Metadata };
    const { sync, emit, auth } = setup(server);
    sync.reportDevice({ scheme: 'dark', pack: 'dracula', language: 'en' });
    emit('INITIAL_SESSION', session('u1', server.metadata));
    await flush();

    expect(auth.updateUser).toHaveBeenCalledTimes(1);
    expect(auth.updateUser).toHaveBeenCalledWith({ data: { prefs: { futureKey: true, scheme: 'dark', pack: 'dracula' } } });
    // The account's language stays: it had one.
    expect(server.metadata.locale).toBe('he');
    expect(sync.getSnapshot().prefs).toEqual({ language: 'he', scheme: 'dark', pack: 'dracula' });

    // A device value reported after the load fills a gap too.
    sync.reportDevice({ measurement: 'metric' });
    await flush();
    expect(auth.updateUser).toHaveBeenLastCalledWith({
      data: { prefs: { futureKey: true, scheme: 'dark', pack: 'dracula', measurement: 'metric' } },
    });
    expect(auth.updateUser).toHaveBeenCalledTimes(2);
  });

  it('does not fill gaps from the stored session before the server answers', async () => {
    const server = { metadata: { prefs: { scheme: 'light' } } as Metadata };
    const { sync, emit, auth } = setup(server);
    emit('INITIAL_SESSION', session('u1', {}));
    sync.reportDevice({ scheme: 'dark' });
    expect(auth.updateUser).not.toHaveBeenCalled();
    await flush();
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(sync.getSnapshot().prefs).toEqual({ scheme: 'light' });
  });

  it('saves a change made on this device, writing the whole prefs object', async () => {
    const server = { metadata: { locale: 'en', name: 'Cook', prefs: { scheme: 'dark', pack: 'mist' } } as Metadata };
    const { sync, emit, auth } = setup(server);
    emit('INITIAL_SESSION', session('u1', server.metadata));
    await flush();

    sync.save({ pack: 'wizard' });
    // Shown at once.
    expect(sync.getSnapshot().prefs.pack).toBe('wizard');
    sync.save({ measurement: 'metric' });
    sync.save({ language: 'ar' });
    await flush();

    expect(auth.updateUser.mock.calls.map(([attrs]) => attrs)).toEqual([
      { data: { prefs: { scheme: 'dark', pack: 'wizard' } } },
      { data: { prefs: { scheme: 'dark', pack: 'wizard', measurement: 'metric' } } },
      { data: { locale: 'ar' } },
    ]);
    expect(server.metadata).toEqual({
      locale: 'ar',
      name: 'Cook',
      prefs: { scheme: 'dark', pack: 'wizard', measurement: 'metric' },
    });
    expect(sync.getSnapshot()).toEqual({
      userId: 'u1',
      loaded: true,
      prefs: { scheme: 'dark', pack: 'wizard', measurement: 'metric', language: 'ar' },
    });
  });

  it('does not write what the account already holds', async () => {
    const server = { metadata: { prefs: { scheme: 'dark' } } as Metadata };
    const { sync, emit, auth } = setup(server);
    emit('INITIAL_SESSION', session('u1', server.metadata));
    await flush();
    sync.save({ scheme: 'dark' });
    await flush();
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it('signed out, a change stays on the device and fills the account on the next sign-in', async () => {
    const server = { metadata: {} as Metadata };
    const { sync, emit, auth } = setup(server);
    emit('INITIAL_SESSION', null);
    sync.save({ measurement: 'metric' });
    await flush();
    expect(auth.updateUser).not.toHaveBeenCalled();

    emit('SIGNED_IN', session('u1', {}));
    await flush();
    expect(auth.updateUser).toHaveBeenCalledWith({ data: { prefs: { measurement: 'metric' } } });
  });

  it('picks up a change from another device on token refresh, but not while saving', async () => {
    const server = { metadata: { prefs: { scheme: 'dark' } } as Metadata };
    const { sync, emit, auth } = setup(server);
    emit('INITIAL_SESSION', session('u1', server.metadata));
    await flush();

    emit('TOKEN_REFRESHED', session('u1', { prefs: { scheme: 'light' } }));
    expect(sync.getSnapshot().prefs.scheme).toBe('light');

    // A save is on its way: an older copy arriving meanwhile doesn't undo it.
    server.metadata = { prefs: { scheme: 'light' } };
    sync.save({ scheme: 'system' });
    emit('TOKEN_REFRESHED', session('u1', { prefs: { scheme: 'light' } }));
    expect(sync.getSnapshot().prefs.scheme).toBe('system');
    await flush();
    expect(auth.updateUser).toHaveBeenCalledTimes(1);
    expect(sync.getSnapshot().prefs.scheme).toBe('system');
  });

  it('ignores SIGNED_IN for the same account (supabase-js repeats it from storage)', async () => {
    const server = { metadata: { prefs: { scheme: 'dark' } } as Metadata };
    const { sync, emit, auth } = setup(server);
    emit('INITIAL_SESSION', session('u1', server.metadata));
    await flush();
    emit('SIGNED_IN', session('u1', { prefs: { scheme: 'light' } }));
    expect(sync.getSnapshot().prefs.scheme).toBe('dark');
    expect(auth.getUser).toHaveBeenCalledTimes(1);
  });

  it('a save made before the server answers is not undone by the answer', async () => {
    const server = { metadata: { prefs: { scheme: 'light' } } as Metadata };
    const { sync, emit } = setup(server);
    emit('INITIAL_SESSION', session('u1', server.metadata));
    sync.save({ scheme: 'dark' });
    await flush();
    expect(sync.getSnapshot()).toMatchObject({ loaded: true, prefs: { scheme: 'dark' } });
    expect(server.metadata.prefs).toEqual({ scheme: 'dark' });
  });

  it('signing out empties the store; a late answer for the old account is dropped', async () => {
    const server = { metadata: { prefs: { scheme: 'dark' } } as Metadata };
    const { sync, emit, listener } = setup(server);
    emit('INITIAL_SESSION', session('u1', {}));
    emit('SIGNED_OUT', null);
    await flush();
    expect(sync.getSnapshot()).toEqual({ userId: null, loaded: true, prefs: {} });
    expect(listener).toHaveBeenCalled();
  });

  it('keeps the stored copy when the server cannot be reached, and tries again on refresh', async () => {
    const server = { metadata: { prefs: { scheme: 'dark' } } as Metadata };
    const { sync, emit, auth, advance } = setup(server);
    auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: new Error('offline') } as never);
    emit('INITIAL_SESSION', session('u1', { prefs: { scheme: 'light' } }));
    await flush();
    expect(sync.getSnapshot()).toEqual({ userId: 'u1', loaded: false, prefs: { scheme: 'light' } });

    sync.refresh();
    await flush();
    expect(sync.getSnapshot()).toEqual({ userId: 'u1', loaded: true, prefs: { scheme: 'dark' } });

    // At most once a minute.
    sync.refresh();
    await flush();
    expect(auth.getUser).toHaveBeenCalledTimes(2);
    advance(61_000);
    sync.refresh();
    await flush();
    expect(auth.getUser).toHaveBeenCalledTimes(3);
  });

  it('keeps the same snapshot object when nothing changed', async () => {
    const server = { metadata: { prefs: { scheme: 'dark' } } as Metadata };
    const { sync, emit } = setup(server);
    emit('INITIAL_SESSION', session('u1', server.metadata));
    await flush();
    const before = sync.getSnapshot();
    emit('USER_UPDATED', session('u1', { ...server.metadata, avatar: 'new' }));
    expect(sync.getSnapshot()).toBe(before);
  });

  describe('a pick the server has not confirmed yet', () => {
    function deviceStore(initial: UnsavedPreferences | null = null) {
      const box = { value: initial };
      return {
        box,
        unsaved: {
          read: () => box.value,
          write: (value: UnsavedPreferences | null) => {
            box.value = value;
          },
        },
      };
    }

    it('is kept on the device until the server confirms it', async () => {
      const server = { metadata: { locale: 'en' } as Metadata };
      const { box, unsaved } = deviceStore();
      const { sync, emit } = setup(server, { unsaved });
      emit('INITIAL_SESSION', session('u1', server.metadata));
      await flush();

      sync.save({ language: 'he' });
      expect(box.value).toEqual({ userId: 'u1', prefs: { language: 'he' } });
      await flush();
      expect(server.metadata.locale).toBe('he');
      expect(box.value).toBeNull();
    });

    it("is sent again on the next start, and wins over the account's older value (a reload right after picking)", async () => {
      const server = { metadata: { locale: 'en', prefs: { pack: 'mist' } } as Metadata };
      const { box, unsaved } = deviceStore({ userId: 'u1', prefs: { language: 'he' } });
      const { sync, emit, auth } = setup(server, { unsaved });
      emit('INITIAL_SESSION', session('u1', server.metadata));
      await flush();

      expect(auth.updateUser.mock.calls.map(([attrs]) => attrs)).toEqual([{ data: { locale: 'he' } }]);
      expect(sync.getSnapshot().prefs).toEqual({ language: 'he', pack: 'mist' });
      expect(box.value).toBeNull();
    });

    it("is ignored for another account, and dropped when the account already holds it", async () => {
      const server = { metadata: { locale: 'he' } as Metadata };
      const other = deviceStore({ userId: 'someone-else', prefs: { language: 'ar' } });
      const first = setup(server, { unsaved: other.unsaved });
      first.emit('INITIAL_SESSION', session('u1', server.metadata));
      await flush();
      expect(first.auth.updateUser).not.toHaveBeenCalled();

      const same = deviceStore({ userId: 'u1', prefs: { language: 'he' } });
      const second = setup(server, { unsaved: same.unsaved });
      second.emit('INITIAL_SESSION', session('u1', server.metadata));
      await flush();
      expect(second.auth.updateUser).not.toHaveBeenCalled();
      expect(same.box.value).toBeNull();
    });

    it('reads only well-formed stored values', () => {
      expect(parseUnsavedPreferences('{"userId":"u1","prefs":{"language":"he","scheme":"neon"}}')).toEqual({
        userId: 'u1',
        prefs: { language: 'he' },
      });
      expect(parseUnsavedPreferences('{"prefs":{"language":"he"}}')).toBeNull();
      expect(parseUnsavedPreferences('not json')).toBeNull();
      expect(parseUnsavedPreferences(null)).toBeNull();
    });
  });
});
