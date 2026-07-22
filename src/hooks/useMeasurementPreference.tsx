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

import type { MeasurementSystem } from '@/lib/convertMeasurement';

const STORAGE_KEY = 'pinch:measurementSystem';

type MeasurementContextValue = {
  system: MeasurementSystem;
  setSystem: (next: MeasurementSystem) => void;
};

const MeasurementContext = createContext<MeasurementContextValue | null>(null);

export function MeasurementProvider({ children }: { children: ReactNode }) {
  const [system, setSystemState] = useState<MeasurementSystem>('original');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled && (saved === 'original' || saved === 'metric')) {
          setSystemState(saved);
        }
      } catch {
        // Keep default.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setSystem = useCallback((next: MeasurementSystem) => {
    setSystemState(next);
    void AsyncStorage.setItem(STORAGE_KEY, next);
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
