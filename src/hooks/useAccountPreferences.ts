import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { supabase } from '@/lib/supabase/client';
import {
  createAccountPreferencesSync,
  parseUnsavedPreferences,
  UNSAVED_PREFERENCES_KEY,
  type AccountPreferencesSnapshot,
} from '@shared/lib/supabase/userPreferences';

/**
 * Theme, language and spoons-or-grams as saved on the signed-in account (PIN-154). The theme, language and
 * measurement providers read it and let it win over the device's copy; their setters save through it.
 *
 * Started when this module loads, before any provider's effects, so it hears each auth event before AuthProvider
 * does: the account's language is in place by the time `AccountLocaleSync` compares it with the account.
 */
export const accountPreferences = createAccountPreferencesSync(supabase, {
  // A pick the server hasn't confirmed yet (closed the app at once, offline) is sent again on the next start.
  unsaved: {
    read: async () => parseUnsavedPreferences(await AsyncStorage.getItem(UNSAVED_PREFERENCES_KEY)),
    write: (value) => {
      void (value
        ? AsyncStorage.setItem(UNSAVED_PREFERENCES_KEY, JSON.stringify(value))
        : AsyncStorage.removeItem(UNSAVED_PREFERENCES_KEY)
      ).catch(() => {});
    },
  },
});
// Not while the static web export renders in Node: there is no session there.
if (typeof window !== 'undefined') accountPreferences.start();

// Back in front: pick up a change made on another device (at most once a minute).
try {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') accountPreferences.refresh();
  });
} catch {
  // No AppState (static web export): a reload reads the account anyway.
}

export function useAccountPreferences(): AccountPreferencesSnapshot {
  return useSyncExternalStore(
    accountPreferences.subscribe,
    accountPreferences.getSnapshot,
    accountPreferences.getSnapshot,
  );
}
