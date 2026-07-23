import { decode } from 'base64-arraybuffer';

import {
  currentYearMonthUtc,
  freeExtractsRemaining,
  isSubscriptionActive,
  monthlyExtractsRemaining,
  type SubscriptionStatus,
} from '@/lib/quotas';
import { supabase } from '@/lib/supabase/client';

const AVATAR_BUCKET = 'avatars';

export interface Profile {
  id: string;
  email: string | null;
  avatar_url: string | null;
  token_balance: number;
  is_admin: boolean;
  token_pack_notify_at: string | null;
  subscription_status: SubscriptionStatus;
  subscription_expires_at: string | null;
  free_extracts_used: number;
  monthly_extracts_used: number;
}

export interface ProfileQuota {
  subscriptionStatus: SubscriptionStatus;
  subscriptionActive: boolean;
  freeExtractsUsed: number;
  freeExtractsRemaining: number;
  monthlyExtractsUsed: number;
  monthlyExtractsRemaining: number | null;
  extractsRemaining: number;
}

export function profileQuota(profile: Profile | null): ProfileQuota | null {
  if (!profile) return null;
  const subscriptionActive = isSubscriptionActive(
    profile.subscription_status,
    profile.subscription_expires_at,
  );
  const freeRemaining = freeExtractsRemaining(profile.free_extracts_used);
  const monthlyRemaining = subscriptionActive
    ? monthlyExtractsRemaining(profile.monthly_extracts_used)
    : null;
  return {
    subscriptionStatus: profile.subscription_status,
    subscriptionActive,
    freeExtractsUsed: profile.free_extracts_used,
    freeExtractsRemaining: freeRemaining,
    monthlyExtractsUsed: profile.monthly_extracts_used,
    monthlyExtractsRemaining: monthlyRemaining,
    extractsRemaining: subscriptionActive ? (monthlyRemaining ?? 0) : freeRemaining,
  };
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const yearMonth = currentYearMonthUtc();
  const [profileResult, monthlyResult] = await Promise.all([
    supabase
      .from('profiles')
      .select(
        'id, email, avatar_url, token_balance, is_admin, token_pack_notify_at, subscription_status, subscription_expires_at, free_extracts_used',
      )
      .eq('id', userId)
      .single(),
    supabase
      .from('extract_usage_monthly')
      .select('extract_count')
      .eq('user_id', userId)
      .eq('year_month', yearMonth)
      .maybeSingle(),
  ]);

  if (profileResult.error) {
    if (profileResult.error.code === 'PGRST116') return null;
    throw profileResult.error;
  }

  const row = profileResult.data as {
    id: string;
    email: string | null;
    avatar_url: string | null;
    token_balance?: number | null;
    is_admin?: boolean | null;
    token_pack_notify_at?: string | null;
    subscription_status?: string | null;
    subscription_expires_at?: string | null;
    free_extracts_used?: number | null;
  };

  const status = row.subscription_status;
  const subscription_status: SubscriptionStatus =
    status === 'active' || status === 'canceled' ? status : 'free';

  return {
    id: row.id,
    email: row.email,
    avatar_url: row.avatar_url,
    token_balance: typeof row.token_balance === 'number' ? row.token_balance : 0,
    is_admin: row.is_admin === true,
    token_pack_notify_at: row.token_pack_notify_at ?? null,
    subscription_status,
    subscription_expires_at: row.subscription_expires_at ?? null,
    free_extracts_used:
      typeof row.free_extracts_used === 'number' ? row.free_extracts_used : 0,
    monthly_extracts_used:
      typeof monthlyResult.data?.extract_count === 'number'
        ? monthlyResult.data.extract_count
        : 0,
  };
}

/** Honor-system Pinch Plus until real IAP. */
export async function activateSubscription(userId?: string): Promise<SubscriptionStatus> {
  const id = userId ?? (await supabase.auth.getUser()).data.user?.id;
  if (!id) throw new Error('Sign in required');
  const { data, error } = await supabase.rpc('activate_subscription', {
    p_user_id: id,
  });
  if (error) throw error;
  return data === 'active' ? 'active' : 'active';
}

export async function cancelSubscription(userId?: string): Promise<SubscriptionStatus> {
  const id = userId ?? (await supabase.auth.getUser()).data.user?.id;
  if (!id) throw new Error('Sign in required');
  const { data, error } = await supabase.rpc('cancel_subscription', {
    p_user_id: id,
  });
  if (error) throw error;
  return data === 'canceled' || data === 'free' || data === 'active'
    ? (data as SubscriptionStatus)
    : 'canceled';
}

/** Admin: activate Plus for another user. */
export async function adminSetSubscription(
  userId: string,
  active: boolean,
): Promise<SubscriptionStatus> {
  const { data, error } = await supabase.rpc(
    active ? 'activate_subscription' : 'cancel_subscription',
    { p_user_id: userId },
  );
  if (error) throw error;
  if (active) return 'active';
  return data === 'canceled' ? 'canceled' : 'canceled';
}

/**
 * Uploads a locally-picked image (as base64, from `expo-image-picker`) to the
 * `avatars` Storage bucket and points `profiles.avatar_url` at the resulting
 * public URL. React Native's `fetch`/`Blob` upload path is unreliable with
 * Supabase Storage, so we decode base64 -> ArrayBuffer instead (the
 * documented working approach).
 */
export async function uploadAvatar(
  userId: string,
  base64: string,
  fileExt: string,
): Promise<string> {
  const path = `${userId}-${Date.now()}.${fileExt}`;
  const arrayBuffer = decode(base64);

  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, arrayBuffer, {
      contentType: `image/${fileExt === 'jpg' ? 'jpeg' : fileExt}`,
      upsert: true,
    });
  if (uploadError) throw uploadError;

  const {
    data: { publicUrl },
  } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ avatar_url: publicUrl })
    .eq('id', userId);
  if (updateError) throw updateError;

  return publicUrl;
}
