"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { addPantryStaple, EMPTY_KITCHEN_PROFILE, removePantryStaple } from "@shared/lib/kitchenProfile";
import { pantryHomeNames } from "@shared/lib/pantry";
import { isPantryStaple } from "@shared/lib/pantryStaples";
import { fetchHousehold, setHouseholdStaples } from "@shared/lib/supabase/household";
import { fetchPantryItems } from "@shared/lib/supabase/pantry";

import { useAuth } from "@/components/AuthProvider";
import { useHousehold, useHouseholdLive } from "@/lib/household/HouseholdProvider";

/** The kitchen profile's add/remove rules (trim, no duplicates, the cap), on a bare list. */
const withStaple = (staples: string[], name: string) => addPantryStaple({ ...EMPTY_KITCHEN_PROFILE, pantryStaples: staples }, name).pantryStaples;
const withoutStaple = (staples: string[], name: string) =>
  removePantryStaple({ ...EMPTY_KITCHEN_PROFILE, pantryStaples: staples }, name).pantryStaples;

/**
 * What the household has at home: its "Always have" list (shared by everyone in it since ADR 034; it was each
 * person's kitchen-profile staples before) and what the pantry scan found (PIN-181). Both start unticked when
 * ingredients are added to the list.
 *
 * A change shows at once. Saves run one at a time, in order, and each reads the household's list first and changes
 * only that one name, so a staple someone else added meanwhile is kept. If a save fails, the saved list comes back.
 * If the pantry can't be read, only "Always have" counts.
 */
export function usePantryStaples() {
  const { user } = useAuth();
  const userId = user?.id;
  const { household, failed, refresh, patch } = useHousehold();
  // While saves are in flight, what the person sees is their own edits on top of the last saved list.
  const [optimistic, setOptimistic] = useState<string[] | null>(null);
  const optimisticRef = useRef<string[] | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const inFlight = useRef(0);
  // What the pantry scan found at home (PIN-181). Skipped like a staple; changed only on the Pantry page.
  const [home, setHome] = useState<{ userId: string; names: string[] } | null>(null);

  const readHome = useCallback(() => {
    if (!userId) return () => undefined;
    let cancelled = false;
    fetchPantryItems()
      .catch(() => [])
      .then((items) => {
        if (!cancelled) setHome({ userId, names: pantryHomeNames(items) });
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => readHome(), [readHome]);
  useHouseholdLive("pantry", () => void readHome());

  const householdStaples = household?.staples;
  const saved = useMemo(() => householdStaples ?? (failed ? [] : null), [householdStaples, failed]);
  const alwaysHave = optimistic ?? saved;
  const homeNames = home && home.userId === userId ? home.names : null;
  const staples = useMemo(() => (alwaysHave && homeNames ? [...alwaysHave, ...homeNames] : null), [alwaysHave, homeNames]);

  const change = useCallback(
    (edit: (staples: string[]) => string[]) => {
      if (!userId) return Promise.resolve();
      const shown = edit(optimisticRef.current ?? saved ?? []);
      optimisticRef.current = shown;
      setOptimistic(shown);
      inFlight.current += 1;
      // One save at a time, in order, each on top of the last.
      const run = queue.current.then(async () => {
        const fresh = await fetchHousehold();
        // With the list the edit was made on, the server applies just this edit to its current list.
        const next = await setHouseholdStaples(edit(fresh.staples), fresh.staples);
        patch((current) => ({ ...current, staples: next }));
      });
      queue.current = run
        // If it failed, show what is really saved.
        .catch(() => refresh())
        .finally(() => {
          inFlight.current -= 1;
          if (inFlight.current === 0) {
            optimisticRef.current = null;
            setOptimistic(null);
          }
        });
      return run;
    },
    [patch, refresh, saved, userId],
  );

  const keepStaple = useCallback((name: string) => change((list) => withStaple(list, name)), [change]);
  const dropStaple = useCallback((name: string) => change((list) => withoutStaple(list, name)), [change]);
  const isStaple = useCallback((name: string) => isPantryStaple(name, staples ?? []), [staples]);

  return {
    /** "Always have" and what the pantry holds, for skipping on the list; null until both are known. */
    staples,
    /** The household's "Always have" list alone; null while loading. */
    alwaysHave,
    /** True when the household couldn't be read (the list is then empty). */
    failed,
    retry: refresh,
    isStaple,
    keepStaple,
    dropStaple,
  };
}
