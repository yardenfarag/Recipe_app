import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { useAuth } from '@/hooks/useAuth';
import { isAdminUser } from '@/lib/admin';
import { type SubscriptionStatus } from '@/lib/quotas';
import type { ProfileQuota } from '@/lib/supabase/profile';
import { fetchProfile, profileQuota } from '@/lib/supabase/profile';

/**
 * Loads the current signed-in user's profile (avatar, plan, admin)
 * and refreshes on focus. Guests have no `profiles` row, so this is a no-op
 * for them — callers should branch on `useAuth().user` for guest UI.
 */
export function useProfile() {
  const { user } = useAuth();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [quota, setQuota] = useState<ProfileQuota | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setAvatarUrl(null);
      setQuota(null);
      setSubscriptionStatus(null);
      setIsAdmin(false);
      setLoading(false);
      return;
    }
    try {
      const profile = await fetchProfile(user.id);
      setAvatarUrl(profile?.avatar_url ?? null);
      setQuota(profileQuota(profile));
      setSubscriptionStatus(profile?.subscription_status ?? 'free');
      setIsAdmin(
        isAdminUser({ isAdmin: profile?.is_admin }),
      );
    } catch {
      setAvatarUrl(null);
      setQuota(null);
      setSubscriptionStatus(null);
      setIsAdmin(false);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  // Back from Polar's web checkout (?checkout_id=…): the webhook adds the credits within
  // seconds, so check again a couple of times instead of waiting for the next focus.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !user) return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has('checkout_id')) return;
    const timers = [2_000, 6_000, 15_000].map((delay) => setTimeout(() => void refresh(), delay));
    const cleanup = setTimeout(() => {
      url.searchParams.delete('checkout_id');
      window.history.replaceState(window.history.state, '', url.toString());
    }, 15_500);
    return () => [...timers, cleanup].forEach(clearTimeout);
  }, [refresh, user]);

  return {
    avatarUrl,
    quota,
    subscriptionStatus,
    subscriptionActive: quota?.subscriptionActive ?? false,
    extractsRemaining: quota?.extractsRemaining ?? null,
    freeExtractsRemaining: quota?.freeExtractsRemaining ?? null,
    monthlyExtractsRemaining: quota?.monthlyExtractsRemaining ?? null,
    purchasedCredits: quota?.purchasedCredits ?? null,
    totalCredits: quota?.totalCredits ?? null,
    isAdmin,
    loading,
    refresh,
  };
}
