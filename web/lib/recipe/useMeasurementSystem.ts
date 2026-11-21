"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

import type { MeasurementSystem } from "@shared/lib/convertMeasurement";

import { accountPreferences, useAccountPreferences } from "@/lib/accountPreferences";
import { MEASUREMENT_STORAGE_KEY } from "@/lib/theme";

const listeners = new Set<() => void>();
/** When storage is blocked, the choice lasts until the page closes. */
let fallback: MeasurementSystem = "original";
let storageFailed = false;

function read(): MeasurementSystem {
  if (storageFailed) return fallback;
  try {
    const saved = window.localStorage.getItem(MEASUREMENT_STORAGE_KEY);
    return saved === "metric" ? "metric" : "original";
  } catch {
    return fallback;
  }
}

/** Keeps `next` as this browser's copy and tells every reader. */
function writeDevice(next: MeasurementSystem) {
  fallback = next;
  try {
    window.localStorage.setItem(MEASUREMENT_STORAGE_KEY, next);
  } catch {
    storageFailed = true; // Kept in memory instead.
  }
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
};

/**
 * Spoons ("original") or grams ("metric"). This browser keeps a copy, in step across tabs, under the mobile app's
 * key; the signed-in account's choice wins and is copied here (PIN-154). A change is saved on both.
 */
export function useMeasurementSystem(): { system: MeasurementSystem; setSystem: (system: MeasurementSystem) => void } {
  const device = useSyncExternalStore(subscribe, read, () => "original" as MeasurementSystem);
  const account = useAccountPreferences().prefs.measurement;
  const system = account ?? device;

  // The account's choice becomes this browser's copy, so it shows first next time and stays after signing out.
  useEffect(() => {
    if (account && account !== read()) writeDevice(account);
  }, [account]);

  const setSystem = useCallback((next: MeasurementSystem) => {
    writeDevice(next);
    accountPreferences().save({ measurement: next });
  }, []);

  return { system, setSystem };
}
