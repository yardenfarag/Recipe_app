import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { isAdminUser } from '@/lib/admin';
import { FREE_MONTHLY_EXTRACT_LIMIT, type SubscriptionStatus } from '@/lib/quotas';
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
        isAdminUser({
          email: user.email ?? profile?.email,
          isAdmin: profile?.is_admin,
        }),
      );
    } catch {
      setAvatarUrl(null);
      setQuota(null);
      setSubscriptionStatus(null);
      setIsAdmin(isAdminUser({ email: user.email }));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const signedIn = Boolean(user);

  return {
    avatarUrl,
    quota,
    subscriptionStatus,
    subscriptionActive: quota?.subscriptionActive ?? false,
    extractsRemaining:
      quota?.extractsRemaining ?? (signedIn ? FREE_MONTHLY_EXTRACT_LIMIT : null),
    freeExtractsRemaining:
      quota?.freeExtractsRemaining ?? (signedIn ? FREE_MONTHLY_EXTRACT_LIMIT : null),
    monthlyExtractsRemaining: quota?.monthlyExtractsRemaining ?? null,
    purchasedCredits: quota?.purchasedCredits ?? (signedIn ? 0 : null),
    totalCredits: quota?.totalCredits ?? (signedIn ? FREE_MONTHLY_EXTRACT_LIMIT : null),
    isAdmin,
    loading,
    refresh,
  };
}
