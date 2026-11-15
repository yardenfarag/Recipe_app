import { useEffect, useState } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { isAdminUser } from '@/lib/admin';
import { fetchProfile } from '@/lib/supabase/profile';

/**
 * Is the signed-in user an admin (`profiles.is_admin`)? Looked up only while
 * `enabled`, so a person who never sees a required message costs no request.
 * False until known, and false when the lookup fails.
 *
 * Not `useProfile()`: that hook refreshes on screen focus and is meant for
 * screens, and the in-app message host sits in the root layout, outside any.
 */
export function useIsAdmin(enabled: boolean): boolean {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [admin, setAdmin] = useState(false);

  useEffect(() => {
    if (!enabled || !userId) {
      setAdmin(false);
      return;
    }
    let cancelled = false;
    fetchProfile(userId)
      .then((profile) => {
        if (!cancelled) setAdmin(isAdminUser({ isAdmin: profile?.is_admin }));
      })
      .catch(() => {
        if (!cancelled) setAdmin(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, userId]);

  return admin;
}
