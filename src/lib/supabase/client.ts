import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
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

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});
