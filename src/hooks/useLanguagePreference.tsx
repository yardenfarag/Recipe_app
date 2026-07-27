import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  isAppLanguageCode,
  resolveAppLanguageFromDevice,
  type AppLanguageCode,
} from '@/lib/appLanguages';

const STORAGE_KEY = 'pinch:appLanguage';

type LanguageContextValue = {
  language: AppLanguageCode;
  /** True after AsyncStorage (or device default) has been applied. */
  ready: boolean;
  setLanguage: (next: AppLanguageCode) => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function deviceDefaultLanguage(): AppLanguageCode {
  const locales = Localization.getLocales();
  return resolveAppLanguageFromDevice(locales[0]?.languageCode);
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguageCode>(deviceDefaultLanguage);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled && saved && isAppLanguageCode(saved)) {
          setLanguageState(saved);
        }
      } catch {
        // Keep device default.
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setLanguage = useCallback((next: AppLanguageCode) => {
    setLanguageState(next);
    void AsyncStorage.setItem(STORAGE_KEY, next);
  }, []);

  const value = useMemo(
    () => ({ language, ready, setLanguage }),
    [language, ready, setLanguage],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguagePreference() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguagePreference must be used within LanguageProvider');
  }
  return ctx;
}
