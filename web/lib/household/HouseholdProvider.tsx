"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { fetchHousehold, subscribeToHousehold, type HouseholdChange } from "@shared/lib/supabase/household";
import type { Household } from "@shared/types/household";

import { useAuth } from "@/components/AuthProvider";

/** How long to wait after a live change before reading again, so a burst of changes is one read. */
export const LIVE_DEBOUNCE_MS = 300;

type SharedChange = Exclude<HouseholdChange, "household">;
type Listener = () => void;

export type HouseholdContextValue = {
  /** Null while loading, when it couldn't be read, or signed out. */
  household: Household | null;
  loading: boolean;
  /** True when the last read failed and there is nothing to show. */
  failed: boolean;
  /** Reads the household again. Resolves with it, or null if it failed. */
  refresh: () => Promise<Household | null>;
  /** Puts the household an action returned (set up, rename, join, leave…) in place, without another read. */
  apply: (next: Household) => void;
  /** Changes the household here at once (an optimistic edit), e.g. its "Always have" list. */
  patch: (edit: (household: Household) => Household) => void;
  /**
   * Calls `listener` (debounced) when someone in the household changes the list or the pantry, and when the
   * household itself changes to another one (joined, left, removed). Returns the unsubscribe.
   */
  onShared: (what: SharedChange, listener: Listener) => () => void;
};

const noop = () => undefined;

/** Outside the provider (a unit test of one component): no household, nothing live. */
const FALLBACK: HouseholdContextValue = {
  household: null,
  loading: false,
  failed: false,
  refresh: async () => null,
  apply: noop,
  patch: noop,
  onShared: () => noop,
};

const HouseholdContext = createContext<HouseholdContextValue>(FALLBACK);

/**
 * The signed-in person's household (docs/adr/034-households.md), read once for the whole app, with one live
 * subscription. The list, the pantry and Settings all use it. Live changes don't carry rows: the list and pantry
 * hooks are told to read again (they keep their own rules about saves in flight), and a change to the household
 * itself (members, name, picture, "Always have") reads it again here. It is also read again when the tab comes back.
 */
export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [state, setState] = useState<{ userId: string; household: Household | null; failed: boolean } | null>(null);
  const listeners = useRef<Record<SharedChange, Set<Listener>>>({ list: new Set(), pantry: new Set() });
  const timers = useRef<Partial<Record<HouseholdChange, ReturnType<typeof setTimeout>>>>({});
  const requestId = useRef(0);

  const current = state && state.userId === userId ? state : null;
  const household = current?.household ?? null;
  const householdId = household?.id ?? null;

  const refresh = useCallback(async () => {
    if (!userId) return null;
    const id = ++requestId.current;
    try {
      const next = await fetchHousehold();
      if (requestId.current === id) setState({ userId, household: next, failed: false });
      return next;
    } catch {
      // Keep what is on screen; only say it failed when there is nothing to show.
      if (requestId.current === id) setState((previous) => (previous && previous.userId === userId && previous.household ? previous : { userId, household: null, failed: true }));
      return null;
    }
  }, [userId]);

  useEffect(() => {
    // Loads from the network, so state is set after the response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  const notify = useCallback((what: SharedChange) => {
    for (const listener of listeners.current[what]) listener();
  }, []);

  const schedule = useCallback(
    (what: HouseholdChange) => {
      clearTimeout(timers.current[what]);
      timers.current[what] = setTimeout(() => {
        if (what === "household") void refresh();
        else notify(what);
      }, LIVE_DEBOUNCE_MS);
    },
    [notify, refresh],
  );

  useEffect(() => {
    if (!householdId) return;
    return subscribeToHousehold(householdId, schedule);
  }, [householdId, schedule]);

  // Joined, left or removed: the list and pantry are another household's now.
  const previousId = useRef<string | null>(null);
  useEffect(() => {
    if (previousId.current && householdId && previousId.current !== householdId) {
      notify("list");
      notify("pantry");
    }
    if (householdId) previousId.current = householdId;
  }, [householdId, notify]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of Object.values(pending)) clearTimeout(timer);
    };
  }, []);

  const apply = useCallback(
    (next: Household) => {
      if (!userId) return;
      requestId.current += 1;
      setState({ userId, household: next, failed: false });
    },
    [userId],
  );

  const patch = useCallback(
    (edit: (household: Household) => Household) =>
      setState((previous) => (previous?.household && previous.userId === userId ? { ...previous, household: edit(previous.household) } : previous)),
    [userId],
  );

  const onShared = useCallback((what: SharedChange, listener: Listener) => {
    listeners.current[what].add(listener);
    return () => {
      listeners.current[what].delete(listener);
    };
  }, []);

  const value = useMemo<HouseholdContextValue>(
    () => ({
      household,
      loading: Boolean(userId) && !current,
      failed: current?.failed ?? false,
      refresh,
      apply,
      patch,
      onShared,
    }),
    [household, userId, current, refresh, apply, patch, onShared],
  );

  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>;
}

/** The household and what changes it. */
export function useHousehold(): HouseholdContextValue {
  return useContext(HouseholdContext);
}

/** Runs `listener` when someone in the household changes the list or the pantry (debounced). */
export function useHouseholdLive(what: SharedChange, listener: Listener) {
  const { onShared } = useHousehold();
  const latest = useRef(listener);
  useEffect(() => {
    latest.current = listener;
  });
  useEffect(() => onShared(what, () => latest.current()), [onShared, what]);
}
