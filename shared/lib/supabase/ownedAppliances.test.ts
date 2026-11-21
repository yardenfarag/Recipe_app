import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { createOwnedAppliancesSync } from './ownedAppliances';
import type { PreferencesClient } from './userPreferences';

type Metadata = Record<string, unknown>;

function session(id: string, metadata: Metadata): Session {
  return { user: { id, user_metadata: metadata } } as unknown as Session;
}

async function flush() {
  for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

function setup(server: { metadata: Metadata }) {
  let emit: (event: AuthChangeEvent, session: Session | null) => void = () => {};
  let failNextSave = false;
  const auth = {
    onAuthStateChange: vi.fn((callback: typeof emit) => {
      emit = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    }),
    getUser: vi.fn(async () => ({ data: { user: { id: 'u1', user_metadata: { ...server.metadata } } }, error: null })),
    updateUser: vi.fn(async ({ data }: { data: Metadata }) => {
      if (failNextSave) {
        failNextSave = false;
        return { data: { user: null }, error: new Error('offline') };
      }
      server.metadata = { ...server.metadata, ...data };
      return { data: { user: { id: 'u1', user_metadata: { ...server.metadata } } }, error: null };
    }),
  };
  let time = 0;
  const sync = createOwnedAppliancesSync({ auth } as unknown as PreferencesClient, { now: () => time });
  const listener = vi.fn();
  sync.subscribe(listener);
  return {
    sync,
    auth,
    emit: (event: AuthChangeEvent, s: Session | null) => emit(event, s),
    failNextSave: () => {
      failNextSave = true;
    },
    advance: (ms: number) => {
      time += ms;
    },
  };
}

const stored = (owned: string[], notOwned: string[] = []) => ({ appliances: { owned, notOwned } });

describe('createOwnedAppliancesSync', () => {
  it('is "not set" for a new account and when signed out', async () => {
    const t = setup({ metadata: {} });
    t.emit('INITIAL_SESSION', session('u1', {}));
    await flush();
    expect(t.sync.getSnapshot()).toMatchObject({ userId: 'u1', loaded: true, kitchen: null });
    t.emit('SIGNED_OUT', null);
    expect(t.sync.getSnapshot()).toMatchObject({ userId: null, loaded: true, kitchen: null });
  });

  it("shows the stored session's list at once, then the server's", async () => {
    const t = setup({ metadata: stored(['blender', 'wok']) });
    t.emit('INITIAL_SESSION', session('u1', stored(['blender'])));
    expect(t.sync.getSnapshot()).toMatchObject({ loaded: false, kitchen: { owned: ['blender'] } });
    await flush();
    expect(t.sync.getSnapshot()).toMatchObject({ loaded: true, kitchen: { owned: ['blender', 'wok'] } });
  });

  it('saves only its own key, keeping the other synced choices', async () => {
    const server = { metadata: { locale: 'he', prefs: { scheme: 'dark' } } as Metadata };
    const t = setup(server);
    t.emit('INITIAL_SESSION', session('u1', server.metadata));
    await flush();
    t.sync.save(['oven', 'air_fryer']);
    expect(t.sync.getSnapshot()).toMatchObject({ status: 'saving', kitchen: { owned: ['oven', 'air_fryer'] } });
    await flush();
    expect(t.auth.updateUser).toHaveBeenCalledTimes(1);
    expect(Object.keys(t.auth.updateUser.mock.calls[0][0].data)).toEqual(['appliances']);
    expect(server.metadata.locale).toBe('he');
    expect(server.metadata.prefs).toEqual({ scheme: 'dark' });
    expect(t.sync.getSnapshot()).toMatchObject({ status: 'saved', kitchen: { owned: ['oven', 'air_fryer'] } });
  });

  it('sends only the latest of quick taps, in order', async () => {
    const t = setup({ metadata: {} });
    t.emit('INITIAL_SESSION', session('u1', {}));
    await flush();
    t.sync.save(['blender']);
    t.sync.save(['blender', 'wok']);
    t.sync.save(['wok']);
    expect(t.sync.getSnapshot().kitchen?.owned).toEqual(['wok']);
    await flush();
    const sent = t.auth.updateUser.mock.calls.map((call) => (call[0].data.appliances as { owned: string[] }).owned);
    expect(sent.at(-1)).toEqual(['wok']);
    expect(sent.length).toBeLessThanOrEqual(2);
    expect(t.sync.getSnapshot()).toMatchObject({ status: 'saved', kitchen: { owned: ['wok'] } });
  });

  it("goes back to the account's list when a save fails", async () => {
    const t = setup({ metadata: stored(['blender']) });
    t.emit('INITIAL_SESSION', session('u1', stored(['blender'])));
    await flush();
    t.failNextSave();
    t.sync.save(['blender', 'wok']);
    expect(t.sync.getSnapshot().kitchen?.owned).toEqual(['blender', 'wok']);
    await flush();
    expect(t.sync.getSnapshot()).toMatchObject({ status: 'failed', kitchen: { owned: ['blender'] } });
  });

  it('clears back to "not set"', async () => {
    const server = { metadata: stored(['blender']) };
    const t = setup(server);
    t.emit('INITIAL_SESSION', session('u1', server.metadata));
    await flush();
    t.sync.clear();
    await flush();
    expect(server.metadata.appliances).toBeNull();
    expect(t.sync.getSnapshot()).toMatchObject({ status: 'saved', kitchen: null });
  });

  it('picks up a list saved on the other device', async () => {
    const server = { metadata: {} as Metadata };
    const t = setup(server);
    t.emit('INITIAL_SESSION', session('u1', {}));
    await flush();

    // A token refresh carries the server's copy.
    t.emit('TOKEN_REFRESHED', session('u1', stored(['smoker'])));
    expect(t.sync.getSnapshot().kitchen?.owned).toEqual(['smoker']);

    // And refresh() reads it, throttled unless forced.
    server.metadata = stored(['juicer']);
    t.sync.refresh();
    await flush();
    expect(t.sync.getSnapshot().kitchen?.owned).toEqual(['smoker']);
    t.sync.refresh({ force: true });
    await flush();
    expect(t.sync.getSnapshot().kitchen?.owned).toEqual(['juicer']);
  });

  it("does not let a refresh step back over this device's save", async () => {
    const server = { metadata: stored(['blender']) };
    const t = setup(server);
    t.emit('INITIAL_SESSION', session('u1', server.metadata));
    await flush();
    t.sync.save(['wok']);
    // The other event the save causes, before the answer lands.
    t.emit('USER_UPDATED', session('u1', stored(['blender'])));
    expect(t.sync.getSnapshot().kitchen?.owned).toEqual(['wok']);
    await flush();
    expect(t.sync.getSnapshot().kitchen?.owned).toEqual(['wok']);
  });

  it("never shows one account's list to the next", async () => {
    const t = setup({ metadata: {} });
    t.emit('INITIAL_SESSION', session('u1', stored(['wok'])));
    t.emit('SIGNED_OUT', null);
    t.emit('SIGNED_IN', session('u2', {}));
    expect(t.sync.getSnapshot()).toMatchObject({ userId: 'u2', kitchen: null });
  });

  it('does nothing when signed out', async () => {
    const t = setup({ metadata: {} });
    t.emit('INITIAL_SESSION', null);
    t.sync.save(['wok']);
    await flush();
    expect(t.auth.updateUser).not.toHaveBeenCalled();
    expect(t.sync.getSnapshot().kitchen).toBeNull();
  });
});
