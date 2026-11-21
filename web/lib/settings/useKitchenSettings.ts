"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { KitchenProfile } from "@shared/lib/kitchenProfile";
import { fetchContributeToHub, setContributeToHub } from "@shared/lib/supabase/cookingHub";
import { fetchCloudKitchenProfile, saveCloudKitchenProfile } from "@shared/lib/supabase/kitchen";

import { useAuth } from "@/components/AuthProvider";

export type SaveStatus = "idle" | "saving" | "saved" | "failed";

type Loaded = { userId: string; profile: KitchenProfile; contributeToHub: boolean };

/**
 * The account's kitchen profile (diets, servings, swaps, pantry, allergies and dislikes) and whether its imports
 * go to the Cooking Hub. Both live on the account, so a change here shows in the mobile app after a refresh.
 *
 * Every change saves at once, like the mobile app. Changes made while one is saving are queued, and only the
 * latest is written, so a quick run of taps never lands out of order. If the profile can't be read, nothing is
 * shown or saved: saving over a profile we couldn't read would wipe it.
 */
export function useKitchenSettings() {
  const { user } = useAuth();
  const userId = user?.id;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const pending = useRef<KitchenProfile | null>(null);
  const saving = useRef(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoadFailed(false);
    try {
      const [profile, contributeToHub] = await Promise.all([
        fetchCloudKitchenProfile(userId),
        // The mobile app treats an unreadable flag as "on", the column's default.
        fetchContributeToHub(userId).catch(() => true),
      ]);
      setLoaded({ userId, profile, contributeToHub });
    } catch {
      setLoadFailed(true);
    }
  }, [userId]);

  useEffect(() => {
    // Loading the account's profile when the page opens is what this effect is for.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const flush = useCallback(async () => {
    if (!userId || saving.current) return;
    saving.current = true;
    setStatus("saving");
    let failed = false;
    while (pending.current) {
      const next = pending.current;
      pending.current = null;
      try {
        await saveCloudKitchenProfile(userId, next);
      } catch {
        failed = true;
      }
    }
    saving.current = false;
    setStatus(failed ? "failed" : "saved");
  }, [userId]);

  const save = useCallback(
    (next: KitchenProfile) => {
      setLoaded((current) => (current ? { ...current, profile: next } : current));
      pending.current = next;
      void flush();
    },
    [flush],
  );

  const saveContributeToHub = useCallback(
    async (next: boolean) => {
      if (!userId) return;
      setLoaded((current) => (current ? { ...current, contributeToHub: next } : current));
      setStatus("saving");
      try {
        await setContributeToHub(userId, next);
        setStatus("saved");
      } catch {
        setLoaded((current) => (current ? { ...current, contributeToHub: !next } : current));
        setStatus("failed");
      }
    },
    [userId],
  );

  const current = loaded && loaded.userId === userId ? loaded : null;
  return {
    profile: current?.profile ?? null,
    contributeToHub: current?.contributeToHub ?? true,
    loading: !current && !loadFailed,
    loadFailed,
    retry: load,
    status,
    save,
    saveContributeToHub,
  };
}
