/**
 * The mobile app's Supabase client: the shared client (shared/lib/supabase/client.ts) with device storage.
 * Importing this file creates it. The root layout imports it first, so shared modules can use `supabase` too.
 */
import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';

import { initSupabaseClient, normalizeSupabaseUrl } from '@shared/lib/supabase/client';
import { createPreviewFetch, parsePreviewFunctions } from '@shared/lib/supabase/functionPreview';

const supabaseUrl = normalizeSupabaseUrl(process.env.EXPO_PUBLIC_SUPABASE_URL);
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    '[client: init] Missing Supabase env vars || ' +
      `EXPO_PUBLIC_SUPABASE_URL=${supabaseUrl ? 'set' : 'MISSING'} || ` +
      `EXPO_PUBLIC_SUPABASE_KEY=${supabaseKey ? 'set' : 'MISSING'} — check your .env file`,
  );
}

// Expo web static export SSR-renders in Node where `window` is undefined.
// AsyncStorage's web impl touches `window.localStorage` and crashes auth init.
const authStorage = {
  getItem: (key: string) => {
    if (typeof window === 'undefined') return null;
    return AsyncStorage.getItem(key);
  },
  setItem: (key: string, value: string) => {
    if (typeof window === 'undefined') return;
    return AsyncStorage.setItem(key, value);
  },
  removeItem: (key: string) => {
    if (typeof window === 'undefined') return;
    return AsyncStorage.removeItem(key);
  },
};

// Dev builds only: production builds always call the real functions.
const previewFetch = __DEV__
  ? createPreviewFetch(parsePreviewFunctions(process.env.EXPO_PUBLIC_FUNCTION_PREVIEWS))
  : undefined;

export const supabase = initSupabaseClient({
  url: supabaseUrl,
  key: supabaseKey,
  storage: authStorage,
  detectSessionInUrl: false,
  fetch: previewFetch,
});
