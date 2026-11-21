"use client";

import { useEffect, useState } from "react";

import { isAdminUser } from "@shared/lib/admin";
import { fetchProfile } from "@shared/lib/supabase/profile";

import { useAuth } from "@/components/AuthProvider";
import { getSupabase } from "@/lib/supabase";

/** One read per account per page load, shared by the account menu (drawn twice) and the admin pages. */
const answers = new Map<string, Promise<boolean>>();

/** Whether `userId`'s profile has `is_admin`. A failed read is not kept, so the next page tries again. */
export function readIsAdmin(userId: string): Promise<boolean> {
  let answer = answers.get(userId);
  if (!answer) {
    answer = (async () => {
      getSupabase();
      const profile = await fetchProfile(userId);
      return isAdminUser({ isAdmin: profile?.is_admin });
    })();
    answers.set(userId, answer);
    answer.catch(() => answers.delete(userId));
  }
  return answer;
}

/** For tests: forget what was read. */
export function forgetIsAdmin(): void {
  answers.clear();
}

/**
 * Whether the signed-in account is an admin (`profiles.is_admin`, the flag every admin database function checks).
 * False while it loads and when it can't be read. Only decides what to draw: the database refuses non-admins anyway.
 */
export function useIsAdmin(): { isAdmin: boolean; loading: boolean } {
  const { user } = useAuth();
  const userId = user?.id;
  const [loaded, setLoaded] = useState<{ userId: string; isAdmin: boolean } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    // Reads from the network, so state is only set when the answer arrives.
    readIsAdmin(userId).then(
      (isAdmin) => {
        if (!cancelled) setLoaded({ userId, isAdmin });
      },
      () => {
        if (!cancelled) setLoaded({ userId, isAdmin: false });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Never show another account's answer after switching.
  const current = loaded && loaded.userId === userId ? loaded : null;
  return { isAdmin: current?.isAdmin ?? false, loading: Boolean(userId) && !current };
}
