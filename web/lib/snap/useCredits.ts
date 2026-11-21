"use client";

import { useCallback, useEffect, useState } from "react";

import { fetchProfile, profileQuota, type ProfileQuota } from "@shared/lib/supabase/profile";

import { useAuth } from "@/components/AuthProvider";

/**
 * The signed-in person's recipe credits (free this month + purchased), or null while they load or if they can't be
 * read. `refresh` reads them again, after an import.
 */
export function useCredits(): { quota: ProfileQuota | null; refresh: () => Promise<void> } {
  const { user } = useAuth();
  const userId = user?.id;
  const [loaded, setLoaded] = useState<{ userId: string; quota: ProfileQuota | null } | null>(null);

  const load = useCallback(
    (id: string) =>
      fetchProfile(id)
        .then(profileQuota)
        // The balance is only shown; an import still works without it.
        .catch(() => null)
        .then((quota) => setLoaded((previous) => (quota == null && previous?.userId === id ? previous : { userId: id, quota }))),
    [],
  );

  useEffect(() => {
    if (userId) void load(userId);
  }, [load, userId]);

  const refresh = useCallback(async () => {
    if (userId) await load(userId);
  }, [load, userId]);

  // Credits read for someone else (after switching accounts) are never shown.
  return { quota: loaded && loaded.userId === userId ? loaded.quota : null, refresh };
}
