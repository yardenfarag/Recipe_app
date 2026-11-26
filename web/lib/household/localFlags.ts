"use client";

import { useCallback, useSyncExternalStore } from "react";

/** The Household settings page has been opened in this browser: the "New" badge on its row goes. */
export const HOUSEHOLD_SEEN_KEY = "pinch:household:seen";
/** "Not now" on the list's "Shop together" card. */
export const HOUSEHOLD_PROMO_DISMISSED_KEY = "pinch:household:promoDismissed";

const EVENT = "pinch:local-flag";
/** Flags set while this page is open, for when storage is blocked. */
const memory = new Set<string>();

function read(key: string): boolean {
  if (memory.has(key)) return true;
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  // Another tab set it.
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * A yes/no remembered in this browser only (a per-viewer convenience: a badge seen, a card dismissed). Reads as
 * true on the server and before the browser has said, so nothing flashes in and out; storage that is blocked reads
 * as false, so the badge or card shows, which is harmless.
 */
export function useLocalFlag(key: string): [boolean, () => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => true,
  );
  const set = useCallback(() => {
    try {
      window.localStorage.setItem(key, "1");
    } catch {
      // Storage blocked: remembered until the page closes.
      memory.add(key);
    }
    window.dispatchEvent(new Event(EVENT));
  }, [key]);
  return [value, set];
}
