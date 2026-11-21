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

import { accountPreferences, useAccountPreferences } from '@/hooks/useAccountPreferences';
import {
  resolveAppLanguageFromDevice,
  type AppLanguageCode,
} from '@shared/lib/appLanguages';
import { parseAppLanguage } from '@shared/lib/userPreferences';

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

/**
 * The app language. The device keeps a copy (first paint, signed out); the signed-in account's language
 * (`user_metadata.locale`, also used for emails) wins and is copied to the device (PIN-154). It is worked out in
 * render, not in an effect, so it is never a step behind the account `AccountLocaleSync` compares it with.
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [deviceLanguage, setDeviceLanguage] = useState<AppLanguageCode>(deviceDefaultLanguage);
  const [ready, setReady] = useState(false);
  const accountLanguage = useAccountPreferences().prefs.language;
  const language = accountLanguage ?? deviceLanguage;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = parseAppLanguage(await AsyncStorage.getItem(STORAGE_KEY));
        if (!cancelled && saved) {
          // Only a language picked on this device fills an account that has none.
          accountPreferences.reportDevice({ language: saved });
          setDeviceLanguage(accountPreferences.getSnapshot().prefs.language ?? saved);
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

  // The account's language becomes the device's copy.
  useEffect(() => {
    if (!accountLanguage) return;
    setDeviceLanguage(accountLanguage);
    void AsyncStorage.setItem(STORAGE_KEY, accountLanguage).catch(() => {});
  }, [accountLanguage]);

  const setLanguage = useCallback((next: AppLanguageCode) => {
    setDeviceLanguage(next);
    void AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
    accountPreferences.save({ language: next });
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
