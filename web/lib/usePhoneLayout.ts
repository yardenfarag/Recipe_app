"use client";

import { useSyncExternalStore } from "react";

/** Below Tailwind's `md` breakpoint: the phone layouts (bottom bar, tabs, two-column cards). */
const QUERY = "(max-width: 47.9375rem)";

function subscribe(listener: () => void) {
  const query = window.matchMedia(QUERY);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

/**
 * True at phone width. Layout itself is done in CSS (`max-md:`, `md:`); this is for the few things CSS can't
 * change, such as which placeholder text a field shows.
 */
export function usePhoneLayout(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
