"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import type { ThemePackId } from "@shared/constants/themes";

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
 * applied the saved choice before the first paint; this keeps it in step and remembers changes.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [pack, setPackState] = useState<ThemePackId>("mist");
  const [scheme, setScheme] = useState<Scheme>("light");

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
  }, []);

  const setPack = useCallback((next: ThemePackId) => {
    write(THEME_STORAGE.pack, next);
    setPackState(next);
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
