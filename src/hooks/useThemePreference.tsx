import AsyncStorage from '@react-native-async-storage/async-storage';
import * as NavigationBar from 'expo-navigation-bar';
import * as SystemUI from 'expo-system-ui';
import { colorScheme as nwColorScheme } from 'nativewind';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Appearance, Platform, StatusBar as RNStatusBar } from 'react-native';

import { accountPreferences, useAccountPreferences } from '@/hooks/useAccountPreferences';

import {
  DEFAULT_THEME_PACK,
  getThemePackColors,
  ThemePacks,
  type ThemePackColors,
  type ThemePackId,
} from '@shared/constants/themes';
import { parseSchemePreference, parseThemePack } from '@shared/lib/userPreferences';

const SCHEME_KEY = 'pinch.themePreference';
const PACK_KEY = 'pinch.themePack';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedScheme = 'light' | 'dark';

type ThemeContextValue = {
  preference: ThemePreference;
  /** Resolved light/dark after applying system preference. */
  scheme: ResolvedScheme;
  packId: ThemePackId;
  packName: string;
  colors: ThemePackColors;
  setPreference: (next: ThemePreference) => void;
  setPackId: (next: ThemePackId) => void;
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

function hexToRgba(hex: string, alpha: number): string {
  const raw = hex.replace('#', '');
  if (raw.length !== 6) return hex;
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function applyWebDocumentTheme(colors: ThemePackColors, scheme: ResolvedScheme) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.colorScheme = scheme;
  root.style.setProperty('--pinch-scrollbar-track', 'transparent');
  root.style.setProperty('--pinch-scrollbar-thumb', hexToRgba(colors.primary, 0.32));
  root.style.setProperty('--pinch-scrollbar-thumb-hover', hexToRgba(colors.primary, 0.55));
  root.style.setProperty('--pinch-focus-ring', hexToRgba(colors.primary, 0.4));
}

function applyAppearance(preference: ThemePreference, packId: ThemePackId) {
  const resolved = resolveScheme(preference);
  // Always pass resolved light/dark — never "system". On web, NativeWind's
  // class darkMode removes the `dark` class whenever value !== "dark", so
  // set("system") while the OS is dark leaves MistAtmosphere dark (JS packs)
  // but body text stuck on light tokens (text-pinch-dark on dark mist).
  nwColorScheme.set(resolved);
  const colors = getThemePackColors(packId, resolved);
  applyWebDocumentTheme(colors, resolved);

  void (async () => {
    try {
      await SystemUI.setBackgroundColorAsync(colors.background);
    } catch {
      // Non-fatal on some Android builds.
    }
    if (Platform.OS === 'android') {
      // Edge-to-edge is always on (Expo 54 / RN 0.81). Only bar *style* is
      // reliably customizable — translucent/backgroundColor are no-ops or
      // deprecated under edge-to-edge.
      try {
        RNStatusBar.setBarStyle(resolved === 'dark' ? 'light-content' : 'dark-content');
      } catch {
        // Non-fatal on some Android builds.
      }
      try {
        await NavigationBar.setButtonStyleAsync(resolved === 'dark' ? 'light' : 'dark');
      } catch {
        // Some Android builds/devices reject nav bar theming; non-fatal.
      }
    }
  })();
}

/**
 * Light/dark/auto and the theme pack. The device keeps a copy (first paint, signed out); the signed-in account's
 * choice wins and is copied to the device (PIN-154). Changes made here are saved on both.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [packId, setPackIdState] = useState<ThemePackId>(DEFAULT_THEME_PACK);
  const [resolvedScheme, setResolvedScheme] = useState<ResolvedScheme>(() =>
    resolveScheme('system'),
  );
  // What is showing, for callbacks; every change goes through applyLocal or the first read, which set it.
  const current = useRef({ preference, packId });

  const account = useAccountPreferences().prefs;
  const accountScheme = account.scheme;
  const accountPack = account.pack;

  const syncAppearance = useCallback((nextPreference: ThemePreference, nextPack: ThemePackId) => {
    const resolved = resolveScheme(nextPreference);
    applyAppearance(nextPreference, nextPack);
    setResolvedScheme(resolved);
  }, []);

  /** Shows a choice and keeps it as the device's copy. Saving on the account is the caller's business. */
  const applyLocal = useCallback(
    (nextPreference: ThemePreference, nextPack: ThemePackId) => {
      current.current = { preference: nextPreference, packId: nextPack };
      setPreferenceState(nextPreference);
      setPackIdState(nextPack);
      syncAppearance(nextPreference, nextPack);
      void AsyncStorage.multiSet([
        [SCHEME_KEY, nextPreference],
        [PACK_KEY, nextPack],
      ]).catch(() => {});
    },
    [syncAppearance],
  );

  useEffect(() => {
    syncAppearance('system', DEFAULT_THEME_PACK);
    let cancelled = false;
    (async () => {
      try {
        const [savedScheme, savedPack] = await Promise.all([
          AsyncStorage.getItem(SCHEME_KEY),
          AsyncStorage.getItem(PACK_KEY),
        ]);
        if (cancelled) return;
        const deviceScheme = parseSchemePreference(savedScheme);
        const devicePack = parseThemePack(savedPack);
        // Only choices made on this device fill an account that has none.
        accountPreferences.reportDevice({ scheme: deviceScheme, pack: devicePack });
        // The account's choice may have arrived first; it wins.
        const fromAccount = accountPreferences.getSnapshot().prefs;
        const nextScheme = fromAccount.scheme ?? deviceScheme ?? 'system';
        const nextPack = fromAccount.pack ?? devicePack ?? DEFAULT_THEME_PACK;
        current.current = { preference: nextScheme, packId: nextPack };
        setPreferenceState(nextScheme);
        setPackIdState(nextPack);
        syncAppearance(nextScheme, nextPack);
        if (savedPack === 'potter' || nextScheme !== savedScheme || nextPack !== savedPack) {
          void AsyncStorage.multiSet([
            [SCHEME_KEY, nextScheme],
            [PACK_KEY, nextPack],
          ]).catch(() => {});
        }
      } catch {
        // Keep defaults.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [syncAppearance]);

  // The account's choice (on sign-in, app start, or from another device) wins. Not saved back: it came from there.
  useEffect(() => {
    if (!accountScheme && !accountPack) return;
    const nextPreference = accountScheme ?? current.current.preference;
    const nextPack = accountPack ?? current.current.packId;
    if (nextPreference === current.current.preference && nextPack === current.current.packId) return;
    applyLocal(nextPreference, nextPack);
  }, [accountScheme, accountPack, applyLocal]);

  useEffect(() => {
    const sub = Appearance.addChangeListener(() => {
      if (preference === 'system') {
        syncAppearance('system', packId);
      }
    });
    return () => sub.remove();
  }, [preference, packId, syncAppearance]);

  const setPreference = useCallback(
    (next: ThemePreference) => {
      applyLocal(next, current.current.packId);
      accountPreferences.save({ scheme: next });
    },
    [applyLocal],
  );

  const setPackId = useCallback(
    (next: ThemePackId) => {
      applyLocal(current.current.preference, next);
      accountPreferences.save({ pack: next });
    },
    [applyLocal],
  );

  const cyclePreference = useCallback(() => {
    const order: ThemePreference[] = ['system', 'light', 'dark'];
    const next = order[(order.indexOf(current.current.preference) + 1) % order.length];
    setPreference(next);
  }, [setPreference]);

  const scheme = resolvedScheme;

  const colors = useMemo(
    () => getThemePackColors(packId, scheme),
    [packId, scheme],
  );

  const value = useMemo(
    () => ({
      preference,
      scheme,
      packId,
      packName: ThemePacks[packId].name,
      colors,
      setPreference,
      setPackId,
      cyclePreference,
    }),
    [preference, scheme, packId, colors, setPreference, setPackId, cyclePreference],
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
