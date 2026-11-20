/**
 * The Supabase client both apps use.
 *
 * Shared code cannot know where a session is stored: device storage on mobile, browser storage on the web. So each
 * app calls `initSupabaseClient` once at startup and passes its storage in (mobile: `src/lib/supabase/client.ts`).
 * Shared modules import `supabase` from here and get that client.
 */
import { createClient, type SupabaseClient, type SupportedStorage } from '@supabase/supabase-js';

import type { Database } from '../../../supabase/functions/_shared/core/database.types';

export type PinchSupabaseClient = SupabaseClient<Database>;

export interface SupabaseClientConfig {
  /** Project URL. A trailing slash or `/rest/v1` is tolerated. */
  url: string | undefined;
  /** The publishable (anon) key. */
  key: string | undefined;
  /** Where the session is kept. */
  storage: SupportedStorage;
  /** Let supabase-js read the session from the address bar after a sign-in redirect. Off unless asked for. */
  detectSessionInUrl?: boolean;
  /** Replaces `fetch`, for example to route calls to preview Edge Functions in a dev build. */
  fetch?: typeof fetch;
}

/** Project root only. createClient appends /auth/v1 and /rest/v1 itself. */
export function normalizeSupabaseUrl(raw: string | undefined): string | undefined {
  if (!raw) return raw;
  return raw.trim().replace(/\/+$/, '').replace(/\/rest\/v1$/i, '');
}

/** Builds a client. Most code wants `initSupabaseClient`, which also makes it the one `supabase` points at. */
export function createSupabaseClient(config: SupabaseClientConfig): PinchSupabaseClient {
  const url = normalizeSupabaseUrl(config.url);
  if (!url || !config.key) {
    throw new Error(
      `[supabase: init] Missing Supabase settings || url=${url ? 'set' : 'MISSING'} || key=${config.key ? 'set' : 'MISSING'}`,
    );
  }
  return createClient<Database>(url, config.key, {
    ...(config.fetch ? { global: { fetch: config.fetch } } : {}),
    auth: {
      storage: config.storage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: config.detectSessionInUrl ?? false,
      flowType: 'pkce',
    },
  });
}

let current: PinchSupabaseClient | null = null;

/** Creates the app's client. Call it once, at startup, before anything reads `supabase`. */
export function initSupabaseClient(config: SupabaseClientConfig): PinchSupabaseClient {
  current = createSupabaseClient(config);
  return current;
}

/**
 * The client made by `initSupabaseClient`. It is looked up on every use, so a module may import this before the app
 * has started. Using it before then throws.
 */
export const supabase: PinchSupabaseClient = new Proxy({} as PinchSupabaseClient, {
  get(_target, property) {
    if (!current) {
      throw new Error(
        '[supabase] Used before initSupabaseClient() ran. Each app calls it at startup: ' +
          'import the app’s own client module first (mobile: @/lib/supabase/client).',
      );
    }
    const value: unknown = Reflect.get(current, property, current);
    return typeof value === 'function' ? value.bind(current) : value;
  },
});
