"use client";

import { useCallback, useSyncExternalStore } from "react";

export type LibraryLayout = "grid" | "list";

/** The same key as the mobile and Expo web apps use. */
const STORAGE_KEY = "pinch:libraryLayout";
const listeners = new Set<() => void>();

function read(): LibraryLayout {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "grid" || saved === "list") return saved;
  } catch {
    // Storage blocked: use the default.
  }
  // Photo cards everywhere: five or so across on a desktop, two on a phone (PIN-163).
  return "grid";
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
};

/** Cards or rows. Cards until chosen otherwise; a choice is remembered in this browser. */
export function useLibraryLayout() {
  const layout = useSyncExternalStore(subscribe, read, () => "grid" as LibraryLayout);

  const setLayout = useCallback((next: LibraryLayout) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The choice lasts until the page closes.
    }
    for (const listener of listeners) listener();
  }, []);

  return { layout, setLayout };
}
