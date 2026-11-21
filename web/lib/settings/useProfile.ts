"use client";

import { useCallback, useEffect, useState } from "react";

import { isAdminUser } from "@shared/lib/admin";
import { fetchProfile, profileQuota } from "@shared/lib/supabase/profile";
import { onCreditsChanged } from "@shared/lib/webCheckoutReturn";

import { useAuth } from "@/components/AuthProvider";

type Loaded = { userId: string; avatarUrl: string | null; totalCredits: number | null; isAdmin: boolean };

/**
 * The signed-in person's profile photo, credit balance and admin flag, as the mobile app's useProfile reads them.
 * Null values while it loads, or when it can't be read (the screens still work without them).
 */
export function useProfile() {
  const { user } = useAuth();
  const userId = user?.id;
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  const load = useCallback(async (id: string) => {
    try {
      const profile = await fetchProfile(id);
      const quota = profileQuota(profile);
      return {
        userId: id,
        avatarUrl: profile?.avatar_url ?? null,
        totalCredits: quota?.totalCredits ?? null,
        isAdmin: isAdminUser({ isAdmin: profile?.is_admin }),
      };
    } catch {
      return { userId: id, avatarUrl: null, totalCredits: null, isAdmin: false };
    }
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void load(userId).then((next) => {
      if (!cancelled) setLoaded(next);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, load]);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoaded(await load(userId));
  }, [userId, load]);

  // A purchase or a spent credit anywhere on the page updates the balance shown in Settings too.
  useEffect(() => onCreditsChanged(() => void refresh()), [refresh]);

  // Never show another account's profile after switching.
  const current = loaded && loaded.userId === userId ? loaded : null;
  return {
    avatarUrl: current?.avatarUrl ?? null,
    totalCredits: current?.totalCredits ?? null,
    isAdmin: current?.isAdmin ?? false,
    loading: Boolean(userId) && !current,
    refresh,
  };
}
