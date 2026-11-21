"use client";

import { useCallback, useSyncExternalStore } from "react";

import type { MeasurementSystem } from "@shared/lib/convertMeasurement";

/**
 * The same key and values as the mobile app (src/hooks/useMeasurementPreference.tsx). Mobile keeps it on the
 * device only, never on the account, so the web keeps it in this browser.
 */
const STORAGE_KEY = "pinch:measurementSystem";
const listeners = new Set<() => void>();
/** When storage is blocked, the choice lasts until the page closes. */
let fallback: MeasurementSystem = "original";
let storageFailed = false;

function read(): MeasurementSystem {
  if (storageFailed) return fallback;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved === "metric" ? "metric" : "original";
  } catch {
    return fallback;
  }
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
};

/** Spoons ("original") or grams ("metric"), remembered in this browser and kept in step across tabs. */
export function useMeasurementSystem(): { system: MeasurementSystem; setSystem: (system: MeasurementSystem) => void } {
  const system = useSyncExternalStore(subscribe, read, () => "original" as MeasurementSystem);

  const setSystem = useCallback((next: MeasurementSystem) => {
    fallback = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      storageFailed = true; // Kept in memory instead.
    }
    for (const listener of listeners) listener();
  }, []);

  return { system, setSystem };
}
