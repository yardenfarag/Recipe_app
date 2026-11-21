"use client";

import { useSyncExternalStore } from "react";

/** Tailwind's `lg` breakpoint: from here the settings menu and its page sit side by side. */
const QUERY = "(min-width: 64rem)";

function subscribe(listener: () => void) {
  const query = window.matchMedia(QUERY);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

/**
 * True on a desktop-wide window. Settings decides in script, not only in CSS, because the page's one heading
 * differs: "Settings" above the phone menu, the open page's name beside the desktop menu.
 */
export function useWideLayout(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
