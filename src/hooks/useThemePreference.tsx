import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SystemUI from 'expo-system-ui';
import { colorScheme as nwColorScheme, useColorScheme as useNwColorScheme } from 'nativewind';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Appearance } from 'react-native';

import { Colors } from '@/constants/theme';

const STORAGE_KEY = 'pinch.themePreference';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedScheme = 'light' | 'dark';

type ThemeContextValue = {
  preference: ThemePreference;
  /** Resolved light/dark after applying system preference. */
  scheme: ResolvedScheme;
  colors: (typeof Colors)[ResolvedScheme];
  setPreference: (next: ThemePreference) => void;
  /** Cycles system → light → dark → system. */
  cyclePreference: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveScheme(preference: ThemePreference): ResolvedScheme {
  if (preference === 'system') {
    return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
  }
  return preference;
}

function applyScheme(preference: ThemePreference) {
  // NativeWind class strategy — 'system' follows the OS.
  nwColorScheme.set(preference);
  const resolved = resolveScheme(preference);
  void SystemUI.setBackgroundColorAsync(Colors[resolved].background);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const { colorScheme: nwScheme } = useNwColorScheme();

  // Apply system immediately, then hydrate any saved override.
  useEffect(() => {
    applyScheme('system');
    let cancelled = false;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        const next: ThemePreference =
          saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';
        if (!cancelled) {
          setPreferenceState(next);
          applyScheme(next);
        }
      } catch {
        // Keep system default.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep resolved scheme in sync when OS appearance changes under "system".
  useEffect(() => {
    const sub = Appearance.addChangeListener(() => {
      if (preference === 'system') {
        applyScheme('system');
      }
    });
    return () => sub.remove();
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    applyScheme(next);
    void AsyncStorage.setItem(STORAGE_KEY, next);
  }, []);

  const cyclePreference = useCallback(() => {
    setPreferenceState((prev) => {
      const order: ThemePreference[] = ['system', 'light', 'dark'];
      const next = order[(order.indexOf(prev) + 1) % order.length];
      applyScheme(next);
      void AsyncStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  const scheme: ResolvedScheme =
    nwScheme === 'dark' || nwScheme === 'light'
      ? nwScheme
      : resolveScheme(preference);

  const value = useMemo(
    () => ({
      preference,
      scheme,
      colors: Colors[scheme],
      setPreference,
      cyclePreference,
    }),
    [preference, scheme, setPreference, cyclePreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemePreference() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useThemePreference must be used within ThemeProvider');
  }
  return ctx;
}
