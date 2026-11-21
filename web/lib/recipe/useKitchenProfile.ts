"use client";

import { useEffect, useState } from "react";

import type { AvoidList } from "@shared/lib/avoidList";
import { EMPTY_KITCHEN_PROFILE } from "@shared/lib/kitchenProfile";
import { fetchCloudKitchenProfile } from "@shared/lib/supabase/kitchen";

import { useAuth } from "@/components/AuthProvider";

/**
 * The signed-in person's avoid list (allergies, dislikes) from their kitchen profile, or null while it loads. If
 * it cannot be read the list is empty, as on mobile, so the recipe still shows.
 */
export function useKitchenProfile(): { profile: AvoidList | null } {
  const { user } = useAuth();
  const userId = user?.id;
  const [loaded, setLoaded] = useState<{ userId: string; profile: AvoidList } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchCloudKitchenProfile(userId)
      .catch(() => EMPTY_KITCHEN_PROFILE)
      .then((profile) => {
        if (!cancelled) setLoaded({ userId, profile });
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // A profile loaded for someone else (after switching accounts) is never shown.
  return { profile: loaded && loaded.userId === userId ? loaded.profile : null };
}
