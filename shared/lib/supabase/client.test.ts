import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));

const storage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

async function load() {
  vi.resetModules();
  return import('./client');
}

describe('shared Supabase client', () => {
  beforeEach(() => {
    mocks.createClient.mockReset();
  });

  it('passes the storage in and keeps sessions with PKCE', async () => {
    const { createSupabaseClient } = await load();
    createSupabaseClient({ url: 'https://x.supabase.co', key: 'k', storage });

    expect(mocks.createClient).toHaveBeenCalledWith('https://x.supabase.co', 'k', {
      auth: { storage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false, flowType: 'pkce' },
    });
  });

  it('trims the URL down to the project root', async () => {
    const { normalizeSupabaseUrl } = await load();
    expect(normalizeSupabaseUrl(' https://x.supabase.co/rest/v1/ ')).toBe('https://x.supabase.co');
    expect(normalizeSupabaseUrl('https://x.supabase.co//')).toBe('https://x.supabase.co');
    expect(normalizeSupabaseUrl(undefined)).toBeUndefined();
  });

  it('uses a replacement fetch only when one is given', async () => {
    const { createSupabaseClient } = await load();
    const previewFetch = vi.fn() as unknown as typeof fetch;
    createSupabaseClient({ url: 'https://x.supabase.co', key: 'k', storage, fetch: previewFetch, detectSessionInUrl: true });

    const options = mocks.createClient.mock.calls[0][2];
    expect(options.global).toEqual({ fetch: previewFetch });
    expect(options.auth.detectSessionInUrl).toBe(true);
  });

  it('refuses to start without a URL or a key', async () => {
    const { createSupabaseClient } = await load();
    expect(() => createSupabaseClient({ url: undefined, key: 'k', storage })).toThrow(/url=MISSING/);
    expect(() => createSupabaseClient({ url: 'https://x.supabase.co', key: '', storage })).toThrow(/key=MISSING/);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it('throws a clear error when used before the app started it', async () => {
    const { supabase } = await load();
    expect(() => supabase.from).toThrow(/before initSupabaseClient/);
  });

  it('points `supabase` at the client the app created, with methods bound to it', async () => {
    const real = {
      name: 'real',
      from(table: string) {
        return `${this.name}:${table}`;
      },
      auth: { marker: true },
    };
    mocks.createClient.mockReturnValue(real);
    const { initSupabaseClient, supabase } = await load();

    expect(initSupabaseClient({ url: 'https://x.supabase.co', key: 'k', storage })).toBe(real);

    const { from } = supabase as unknown as typeof real;
    expect(from('recipes')).toBe('real:recipes');
    expect(supabase.auth).toBe(real.auth);
  });
});
