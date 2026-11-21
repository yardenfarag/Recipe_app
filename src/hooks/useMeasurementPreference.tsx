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
import type { MeasurementSystem } from '@shared/lib/convertMeasurement';
import { parseMeasurementSystem } from '@shared/lib/userPreferences';

const STORAGE_KEY = 'pinch:measurementSystem';

type MeasurementContextValue = {
  system: MeasurementSystem;
  setSystem: (next: MeasurementSystem) => void;
};

const MeasurementContext = createContext<MeasurementContextValue | null>(null);

/**
 * Spoons or grams. The device keeps a copy (first paint, signed out); the signed-in account's choice wins and is
 * copied to the device, so it stays after signing out (PIN-154).
 */
export function MeasurementProvider({ children }: { children: ReactNode }) {
  const [deviceSystem, setDeviceSystem] = useState<MeasurementSystem>('original');
  const accountSystem = useAccountPreferences().prefs.measurement;
  const system = accountSystem ?? deviceSystem;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = parseMeasurementSystem(await AsyncStorage.getItem(STORAGE_KEY));
        if (cancelled || !saved) return;
        accountPreferences.reportDevice({ measurement: saved });
        // The account's choice may have arrived first; it wins.
        setDeviceSystem(accountPreferences.getSnapshot().prefs.measurement ?? saved);
      } catch {
        // Keep default.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // The account's choice becomes the device's copy.
  useEffect(() => {
    if (!accountSystem) return;
    setDeviceSystem(accountSystem);
    void AsyncStorage.setItem(STORAGE_KEY, accountSystem).catch(() => {});
  }, [accountSystem]);

  const setSystem = useCallback((next: MeasurementSystem) => {
    setDeviceSystem(next);
    void AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
    accountPreferences.save({ measurement: next });
  }, []);

  const value = useMemo(() => ({ system, setSystem }), [system, setSystem]);

  return (
    <MeasurementContext.Provider value={value}>{children}</MeasurementContext.Provider>
  );
}

export function useMeasurementPreference() {
  const ctx = useContext(MeasurementContext);
  if (!ctx) {
    throw new Error('useMeasurementPreference must be used within MeasurementProvider');
  }
  return ctx;
}
