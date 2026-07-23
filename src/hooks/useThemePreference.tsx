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
  useState,
  type ReactNode,
} from 'react';
import { Appearance, Platform, StatusBar as RNStatusBar } from 'react-native';

import {
  DEFAULT_THEME_PACK,
  getThemePackColors,
  isThemePackId,
  ThemePacks,
  type ThemePackColors,
  type ThemePackId,
} from '@/constants/themes';

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

function applyAppearance(preference: ThemePreference, packId: ThemePackId) {
  const resolved = resolveScheme(preference);
  // Always pass resolved light/dark — never "system". On web, NativeWind's
  // class darkMode removes the `dark` class whenever value !== "dark", so
  // set("system") while the OS is dark leaves MistAtmosphere dark (JS packs)
  // but body text stuck on light tokens (text-pinch-dark on dark mist).
  nwColorScheme.set(resolved);
  const colors = getThemePackColors(packId, resolved);
  void (async () => {
    try {
      await SystemUI.setBackgroundColorAsync(colors.background);
    } catch {
      // Non-fatal on some Android builds.
    }
    if (Platform.OS === 'android') {
      try {
        RNStatusBar.setTranslucent(false);
        RNStatusBar.setBarStyle(resolved === 'dark' ? 'light-content' : 'dark-content');
        RNStatusBar.setBackgroundColor(colors.background);
      } catch {
        // Non-fatal on some Android builds.
      }
      try {
        await NavigationBar.setBackgroundColorAsync(colors.tabBar);
        await NavigationBar.setButtonStyleAsync(resolved === 'dark' ? 'light' : 'dark');
      } catch {
        // Some Android builds/devices reject nav bar theming; non-fatal.
      }
    }
  })();
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [packId, setPackIdState] = useState<ThemePackId>(DEFAULT_THEME_PACK);
  const [resolvedScheme, setResolvedScheme] = useState<ResolvedScheme>(() =>
    resolveScheme('system'),
  );

  const syncAppearance = useCallback((nextPreference: ThemePreference, nextPack: ThemePackId) => {
    const resolved = resolveScheme(nextPreference);
    applyAppearance(nextPreference, nextPack);
    setResolvedScheme(resolved);
  }, []);

  useEffect(() => {
    syncAppearance('system', DEFAULT_THEME_PACK);
    let cancelled = false;
    (async () => {
      try {
        const [savedScheme, savedPack] = await Promise.all([
          AsyncStorage.getItem(SCHEME_KEY),
          AsyncStorage.getItem(PACK_KEY),
        ]);
        const nextScheme: ThemePreference =
          savedScheme === 'light' || savedScheme === 'dark' || savedScheme === 'system'
            ? savedScheme
            : 'system';
        const nextPack: ThemePackId = isThemePackId(savedPack)
          ? savedPack
          : DEFAULT_THEME_PACK;
        if (!cancelled) {
          setPreferenceState(nextScheme);
          setPackIdState(nextPack);
          syncAppearance(nextScheme, nextPack);
        }
      } catch {
        // Keep defaults.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [syncAppearance]);

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
      setPreferenceState(next);
      syncAppearance(next, packId);
      void AsyncStorage.setItem(SCHEME_KEY, next);
    },
    [packId, syncAppearance],
  );

  const setPackId = useCallback(
    (next: ThemePackId) => {
      setPackIdState(next);
      syncAppearance(preference, next);
      void AsyncStorage.setItem(PACK_KEY, next);
    },
    [preference, syncAppearance],
  );

  const cyclePreference = useCallback(() => {
    setPreferenceState((prev) => {
      const order: ThemePreference[] = ['system', 'light', 'dark'];
      const next = order[(order.indexOf(prev) + 1) % order.length];
      syncAppearance(next, packId);
      void AsyncStorage.setItem(SCHEME_KEY, next);
      return next;
    });
  }, [packId, syncAppearance]);

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
