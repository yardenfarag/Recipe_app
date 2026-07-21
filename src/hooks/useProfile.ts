import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { isAdminUser } from '@/lib/admin';
import { fetchProfile, requestTokenPackNotify } from '@/lib/supabase/profile';

/**
 * Loads the current signed-in user's profile (avatar, tokens, admin)
 * and refreshes on focus. Guests have no `profiles` row, so this is a no-op
 * for them — callers should branch on `useAuth().user` for guest UI.
 */
export function useProfile() {
  const { user } = useAuth();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);
  const [tokenPackNotifyAt, setTokenPackNotifyAt] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setAvatarUrl(null);
      setTokenBalance(null);
      setTokenPackNotifyAt(null);
      setIsAdmin(false);
      setLoading(false);
      return;
    }
    try {
      const profile = await fetchProfile(user.id);
      setAvatarUrl(profile?.avatar_url ?? null);
      setTokenBalance(profile?.token_balance ?? 0);
      setTokenPackNotifyAt(profile?.token_pack_notify_at ?? null);
      setIsAdmin(
        isAdminUser({
          email: user.email ?? profile?.email,
          isAdmin: profile?.is_admin,
        }),
      );
    } catch {
      setAvatarUrl(null);
      setTokenBalance(null);
      setTokenPackNotifyAt(null);
      setIsAdmin(isAdminUser({ email: user.email }));
    } finally {
      setLoading(false);
    }
  }, [user]);

  const requestPackNotify = useCallback(async () => {
    if (!user) throw new Error('Sign in required');
    const at = await requestTokenPackNotify(user.id);
    setTokenPackNotifyAt(at);
    return at;
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return {
    avatarUrl,
    tokenBalance,
    tokenPackNotifyAt,
    isAdmin,
    loading,
    refresh,
    requestPackNotify,
  };
}
