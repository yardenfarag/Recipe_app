import AsyncStorage from '@react-native-async-storage/async-storage';
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
import { useLanguagePreference } from '@/hooks/useLanguagePreference';
import { parseUnitSystem, resolveUnitSystem, type UnitSystem } from '@shared/lib/unitSystem';

/** The same key and values as the web app (web/lib/theme.ts). */
export const UNIT_SYSTEM_STORAGE_KEY = 'pinch:unitSystem';

type UnitSystemContextValue = {
  /** What recipes show: the cook's pick, or the app language's default (US for English, Metric otherwise). */
  units: UnitSystem;
  /** The cook's pick, if they made one. */
  choice: UnitSystem | undefined;
  setUnits: (next: UnitSystem) => void;
};

const UnitSystemContext = createContext<UnitSystemContextValue | null>(null);

/**
 * Metric (°C, g, cm) or US (°F, oz, in), PIN-53. Kept like spoons-or-grams (PIN-154): the device has a copy, the
 * signed-in account's pick wins and is copied to the device, and a change is saved on both. Until the cook picks,
 * it follows the app language.
 */
export function UnitSystemProvider({ children }: { children: ReactNode }) {
  const [deviceChoice, setDeviceChoice] = useState<UnitSystem | undefined>(undefined);
  const accountChoice = useAccountPreferences().prefs.units;
  const { language } = useLanguagePreference();
  const choice = accountChoice ?? deviceChoice;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = parseUnitSystem(await AsyncStorage.getItem(UNIT_SYSTEM_STORAGE_KEY));
        if (cancelled || !saved) return;
        accountPreferences.reportDevice({ units: saved });
        setDeviceChoice(accountPreferences.getSnapshot().prefs.units ?? saved);
      } catch {
        // Keep the language's default.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // The account's pick becomes the device's copy.
  useEffect(() => {
    if (!accountChoice) return;
    setDeviceChoice(accountChoice);
    void AsyncStorage.setItem(UNIT_SYSTEM_STORAGE_KEY, accountChoice).catch(() => {});
  }, [accountChoice]);

  const setUnits = useCallback((next: UnitSystem) => {
    setDeviceChoice(next);
    void AsyncStorage.setItem(UNIT_SYSTEM_STORAGE_KEY, next).catch(() => {});
    accountPreferences.save({ units: next });
  }, []);

  const value = useMemo(
    () => ({ units: resolveUnitSystem(choice, language), choice, setUnits }),
    [choice, language, setUnits],
  );

  return <UnitSystemContext.Provider value={value}>{children}</UnitSystemContext.Provider>;
}

export function useUnitSystemPreference() {
  const ctx = useContext(UnitSystemContext);
  if (!ctx) {
    throw new Error('useUnitSystemPreference must be used within UnitSystemProvider');
  }
  return ctx;
}
