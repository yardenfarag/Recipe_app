"use client";

import { useSyncExternalStore } from "react";

import {
  createOwnedAppliancesSync,
  UNKNOWN_OWNED_APPLIANCES,
  type OwnedAppliancesSnapshot,
  type OwnedAppliancesSync,
} from "@shared/lib/supabase/ownedAppliances";

import { getSupabase } from "@/lib/supabase";

/**
 * "My appliances" (PIN-155) as saved on the signed-in account, shared with the mobile app. Settings edits it; the
 * recipe page checks a recipe's appliances against it.
 */
const INERT: OwnedAppliancesSync = {
  subscribe: () => () => {},
  getSnapshot: () => UNKNOWN_OWNED_APPLIANCES,
  save: () => {},
  clear: () => {},
  refresh: () => {},
  start: () => {},
  stop: () => {},
};

let sync: OwnedAppliancesSync | null = null;

/** The browser's store, made on first use. On the server, or without Supabase settings (unit tests), it does nothing. */
export function ownedAppliances(): OwnedAppliancesSync {
  if (sync) return sync;
  if (typeof window === "undefined") return INERT;
  try {
    const created = createOwnedAppliancesSync(getSupabase());
    created.start();
    sync = created;
  } catch {
    sync = INERT;
    return sync;
  }
  // Back on the tab: pick up a list ticked on the phone.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") sync?.refresh();
  });
  return sync;
}

// Started when the bundle loads, so the first auth event reaches it.
if (typeof window !== "undefined") ownedAppliances();

const subscribe = (listener: () => void) => ownedAppliances().subscribe(listener);
const getSnapshot = () => ownedAppliances().getSnapshot();
const getServerSnapshot = () => UNKNOWN_OWNED_APPLIANCES;

export function useOwnedAppliances(): OwnedAppliancesSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
