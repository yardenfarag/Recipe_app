"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { addPantryStaple, EMPTY_KITCHEN_PROFILE, removePantryStaple, type KitchenProfile } from "@shared/lib/kitchenProfile";
import { isPantryStaple } from "@shared/lib/pantryStaples";
import { fetchCloudKitchenProfile, saveCloudKitchenProfile } from "@shared/lib/supabase/kitchen";

import { useAuth } from "@/components/AuthProvider";

/**
 * What the person always has at home (the kitchen profile's pantry staples, the same list mobile keeps). Staples
 * start unticked when ingredients are added to the list. Each change reads the saved profile first and changes only
 * the staples, so diets, swaps or allergies changed elsewhere meanwhile are kept.
 */
export function usePantryStaples() {
  const { user } = useAuth();
  const userId = user?.id;
  const [loaded, setLoaded] = useState<{ userId: string; staples: string[] } | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchCloudKitchenProfile(userId)
      .catch(() => EMPTY_KITCHEN_PROFILE)
      .then((profile) => {
        if (!cancelled) setLoaded({ userId, staples: profile.pantryStaples });
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const staples = loaded && loaded.userId === userId ? loaded.staples : null;

  const change = useCallback(
    (edit: (profile: KitchenProfile) => KitchenProfile) => {
      if (!userId) return Promise.resolve();
      setLoaded((previous) =>
        previous && previous.userId === userId
          ? { userId, staples: edit({ ...EMPTY_KITCHEN_PROFILE, pantryStaples: previous.staples }).pantryStaples }
          : previous,
      );
      // One save at a time, in order, each on top of the last.
      const run = queue.current.then(async () => {
        const fresh = await fetchCloudKitchenProfile(userId);
        const next = edit(fresh);
        await saveCloudKitchenProfile(userId, next);
        setLoaded({ userId, staples: next.pantryStaples });
      });
      // If it failed, show what is really saved.
      queue.current = run.catch(() =>
        fetchCloudKitchenProfile(userId)
          .then((profile) => setLoaded({ userId, staples: profile.pantryStaples }))
          .catch(() => undefined),
      );
      return run;
    },
    [userId],
  );

  const keepStaple = useCallback((name: string) => change((profile) => addPantryStaple(profile, name)), [change]);
  const dropStaple = useCallback((name: string) => change((profile) => removePantryStaple(profile, name)), [change]);
  const isStaple = useCallback((name: string) => isPantryStaple(name, staples ?? []), [staples]);

  return { staples, isStaple, keepStaple, dropStaple };
}
