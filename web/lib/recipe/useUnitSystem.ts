"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";

import { parseUnitSystem, resolveUnitSystem, type UnitSystem } from "@shared/lib/unitSystem";

import { accountPreferences, useAccountPreferences } from "@/lib/accountPreferences";
import { UNIT_SYSTEM_STORAGE_KEY } from "@/lib/theme";

const listeners = new Set<() => void>();
/** When storage is blocked, the pick lasts until the page closes. */
let fallback: UnitSystem | undefined;
let storageFailed = false;

function read(): UnitSystem | undefined {
  if (storageFailed) return fallback;
  try {
    return parseUnitSystem(window.localStorage.getItem(UNIT_SYSTEM_STORAGE_KEY));
  } catch {
    return fallback;
  }
}

function writeDevice(next: UnitSystem) {
  fallback = next;
  try {
    window.localStorage.setItem(UNIT_SYSTEM_STORAGE_KEY, next);
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
 * Metric (°C, g, cm) or US (°F, oz, in), PIN-53. Kept like spoons-or-grams (`useMeasurementSystem`): this browser has
 * a copy under the mobile app's key, the signed-in account's pick wins and is copied here, and a change is saved on
 * both. Until the cook picks, it follows the app language (US for English, Metric otherwise).
 */
export function useUnitSystem(): { units: UnitSystem; choice: UnitSystem | undefined; setUnits: (units: UnitSystem) => void } {
  const { i18n } = useTranslation();
  const device = useSyncExternalStore(subscribe, read, () => undefined);
  const account = useAccountPreferences().prefs.units;
  const choice = account ?? device;

  useEffect(() => {
    if (account && account !== read()) writeDevice(account);
  }, [account]);

  const setUnits = useCallback((next: UnitSystem) => {
    writeDevice(next);
    accountPreferences().save({ units: next });
  }, []);

  return { units: resolveUnitSystem(choice, i18n.resolvedLanguage ?? i18n.language), choice, setUnits };
}
