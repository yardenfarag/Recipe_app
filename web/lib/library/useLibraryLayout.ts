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
  // A grid suits a wide screen; on a phone a list shows more at a glance.
  return window.matchMedia("(min-width: 768px)").matches ? "grid" : "list";
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
};

/** Cards or rows. Until chosen it follows the screen size; a choice is remembered in this browser. */
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
