import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { useAuth } from '@/hooks/useAuth';
import { isAdminUser } from '@/lib/admin';
import { type SubscriptionStatus } from '@/lib/quotas';
import type { ProfileQuota } from '@/lib/supabase/profile';
import { fetchProfile, profileQuota } from '@/lib/supabase/profile';
import { onCreditsChanged } from '@/lib/webCheckoutReturn';

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

  // Website: WebCheckoutReturnDialog announces when a web purchase's credits have landed.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    return onCreditsChanged(() => void refresh());
  }, [refresh]);

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
