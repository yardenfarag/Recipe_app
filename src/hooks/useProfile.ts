import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { fetchProfile } from '@/lib/supabase/profile';

/**
 * Loads the current signed-in user's profile (currently just `avatar_url`)
 * and refreshes on focus. Guests have no `profiles` row, so this is a no-op
 * for them — callers should branch on `useAuth().user` for guest UI.
 */
export function useProfile() {
  const { user } = useAuth();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setAvatarUrl(null);
      setLoading(false);
      return;
    }
    try {
      const profile = await fetchProfile(user.id);
      setAvatarUrl(profile?.avatar_url ?? null);
    } catch {
      setAvatarUrl(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return { avatarUrl, loading, refresh };
}
