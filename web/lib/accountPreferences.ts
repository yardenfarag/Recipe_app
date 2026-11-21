"use client";

import { useSyncExternalStore } from "react";

import {
  createAccountPreferencesSync,
  parseUnsavedPreferences,
  UNKNOWN_ACCOUNT_PREFERENCES,
  UNSAVED_PREFERENCES_KEY,
  type AccountPreferencesSnapshot,
  type AccountPreferencesSync,
} from "@shared/lib/supabase/userPreferences";
import { parseAppLanguage, parseMeasurementSystem, parseSchemePreference, parseThemePack } from "@shared/lib/userPreferences";

import { getSupabase } from "@/lib/supabase";
import { LANGUAGE_STORAGE_KEY, MEASUREMENT_STORAGE_KEY, THEME_STORAGE } from "@/lib/theme";

/**
 * Theme, language and spoons-or-grams as saved on the signed-in account (PIN-154). ThemeProvider, LanguageProvider
 * and useMeasurementSystem let it win over this browser's copy and save changes through it.
 */
const INERT: AccountPreferencesSync = {
  subscribe: () => () => {},
  getSnapshot: () => UNKNOWN_ACCOUNT_PREFERENCES,
  save: () => {},
  reportDevice: () => {},
  refresh: () => {},
  start: () => {},
  stop: () => {},
};

let sync: AccountPreferencesSync | null = null;

function stored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** The browser's store, made on first use. On the server, or without Supabase settings (unit tests), it does nothing. */
export function accountPreferences(): AccountPreferencesSync {
  if (sync) return sync;
  if (typeof window === "undefined") return INERT;
  try {
    const created = createAccountPreferencesSync(getSupabase(), {
      // A pick the server hasn't confirmed yet survives a reload, and is sent again.
      unsaved: {
        read: () => parseUnsavedPreferences(stored(UNSAVED_PREFERENCES_KEY)),
        write: (value) => {
          try {
            if (value) window.localStorage.setItem(UNSAVED_PREFERENCES_KEY, JSON.stringify(value));
            else window.localStorage.removeItem(UNSAVED_PREFERENCES_KEY);
          } catch {
            // Storage blocked: the pick is still sent.
          }
        },
      },
    });
    created.start();
    sync = created;
  } catch {
    sync = INERT;
    return sync;
  }
  // What this browser chose before: it fills an account that has none yet (first sync).
  sync.reportDevice({
    scheme: parseSchemePreference(stored(THEME_STORAGE.preference)),
    pack: parseThemePack(stored(THEME_STORAGE.pack)),
    language: parseAppLanguage(stored(LANGUAGE_STORAGE_KEY)),
    measurement: parseMeasurementSystem(stored(MEASUREMENT_STORAGE_KEY)),
  });
  // Back on the tab: pick up a change made on the phone (at most once a minute).
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") sync?.refresh();
  });
  return sync;
}

// Started when the bundle loads, before AuthProvider's effect subscribes, so each auth event reaches this first.
if (typeof window !== "undefined") accountPreferences();

const subscribe = (listener: () => void) => accountPreferences().subscribe(listener);
const getSnapshot = () => accountPreferences().getSnapshot();
const getServerSnapshot = () => UNKNOWN_ACCOUNT_PREFERENCES;

export function useAccountPreferences(): AccountPreferencesSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
