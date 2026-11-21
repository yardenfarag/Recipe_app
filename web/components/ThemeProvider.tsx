"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import type { ThemePackId } from "@shared/constants/themes";

import { accountPreferences, useAccountPreferences } from "@/lib/accountPreferences";
import { THEME_STORAGE, parsePack, parsePreference, resolveScheme, type Scheme, type ThemePreference } from "@/lib/theme";

interface ThemeState {
  preference: ThemePreference;
  scheme: Scheme;
  pack: ThemePackId;
  setPreference: (next: ThemePreference) => void;
  setPack: (next: ThemePackId) => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the choice lasts until the tab closes.
  }
}

function apply(pack: ThemePackId, scheme: Scheme) {
  const root = document.documentElement;
  root.setAttribute("data-pack", pack);
  root.setAttribute("data-scheme", scheme);
}

/**
 * Light, dark or the system's setting, and one of the seven theme packs. The head script (lib/theme.ts) already
 * applied this browser's copy before the first paint; this keeps it in step and remembers changes. Signed in, the
 * account's choice wins once loaded and becomes this browser's copy; a change here is saved on both (PIN-154).
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [pack, setPackState] = useState<ThemePackId>("mist");
  const [scheme, setScheme] = useState<Scheme>("light");
  const account = useAccountPreferences().prefs;

  useEffect(() => {
    const savedPreference = parsePreference(read(THEME_STORAGE.preference));
    const savedPack = parsePack(read(THEME_STORAGE.pack));
    // Reading saved choices from the browser after the first render is the point of this effect.
    /* eslint-disable react-hooks/set-state-in-effect */
    setPreferenceState(savedPreference);
    setPackState(savedPack);
    setScheme(resolveScheme(savedPreference));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // The account's choice (after sign-in, on load, or from the phone) wins. Not saved back: it came from there.
  // Declared after the read above, so on the first render it runs second and the account's value stays.
  useEffect(() => {
    if (!account.scheme) return;
    write(THEME_STORAGE.preference, account.scheme);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreferenceState(account.scheme);
    setScheme(resolveScheme(account.scheme));
  }, [account.scheme]);

  useEffect(() => {
    if (!account.pack) return;
    write(THEME_STORAGE.pack, account.pack);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPackState(account.pack);
  }, [account.pack]);

  // "Auto" follows the system as it changes, e.g. at sunset.
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (preference === "system") setScheme(query.matches ? "dark" : "light");
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [preference]);

  useEffect(() => {
    apply(pack, scheme);
  }, [pack, scheme]);

  const setPreference = useCallback((next: ThemePreference) => {
    write(THEME_STORAGE.preference, next);
    setPreferenceState(next);
    setScheme(resolveScheme(next));
    accountPreferences().save({ scheme: next });
  }, []);

  const setPack = useCallback((next: ThemePackId) => {
    write(THEME_STORAGE.pack, next);
    setPackState(next);
    accountPreferences().save({ pack: next });
  }, []);

  const value = useMemo(
    () => ({ preference, scheme, pack, setPreference, setPack }),
    [preference, scheme, pack, setPreference, setPack],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside <ThemeProvider>");
  return value;
}
