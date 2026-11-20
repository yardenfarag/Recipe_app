import type { SupportedStorage } from "@supabase/supabase-js";

import { initSupabaseClient, type PinchSupabaseClient } from "@shared/lib/supabase/client";

/**
 * The web app's Supabase client: the shared client (shared/lib/supabase/client.ts) with browser storage.
 *
 * Signed-in screens render in the browser (ADR 026), so the client only exists there. The session is kept in
 * localStorage under supabase-js's default key, the same place the Expo web app keeps it, so people stay signed
 * in when pinch-app.io/app switches to this app (PIN-147).
 */
let client: PinchSupabaseClient | null = null;

const browserStorage: SupportedStorage = {
  getItem: (key) => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Storage blocked (private mode, full): the session lasts until the tab closes.
    }
  },
  removeItem: (key) => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Nothing to remove.
    }
  },
};

/** Creates the client on first use. Call it from the browser only (an effect or an event handler). */
export function getSupabase(): PinchSupabaseClient {
  if (typeof window === "undefined") {
    throw new Error("[supabase] The web app's client only runs in the browser.");
  }
  if (!client) {
    client = initSupabaseClient({
      // Written out in full so Next inlines them into the browser bundle.
      url: process.env.NEXT_PUBLIC_SUPABASE_URL,
      key: process.env.NEXT_PUBLIC_SUPABASE_KEY,
      storage: browserStorage,
      // Pages that receive a session in the URL (auth-callback, reset-password) read it themselves.
      detectSessionInUrl: false,
    });
  }
  return client;
}

/** Where a sign-in or reset email link returns to: this site, under /app. */
export function authRedirectUrl(path: string): string {
  return `${window.location.origin}/app/${path.replace(/^\/+/, "")}`;
}
