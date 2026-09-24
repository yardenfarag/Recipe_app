import { decode } from 'base64-arraybuffer';

import {
  currentYearMonthUtc,
  freeExtractsRemaining,
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
  /** @deprecated Lifetime counter; Free/Plus both use monthly_extracts_used. */
  free_extracts_used: number;
  monthly_extracts_used: number;
  contribute_to_hub: boolean;
}

export interface ProfileQuota {
  subscriptionStatus: SubscriptionStatus;
  subscriptionActive: boolean;
  freeExtractsUsed: number;
  freeExtractsRemaining: number;
  monthlyExtractsUsed: number;
  monthlyExtractsRemaining: number | null;
  extractsRemaining: number;
  purchasedCredits: number;
  totalCredits: number;
}

const PROFILE_SELECT =
  'id, email, avatar_url, token_balance, is_admin, token_pack_notify_at, subscription_status, subscription_expires_at, free_extracts_used, contribute_to_hub';

type ProfileRow = {
  id: string;
  email: string | null;
  avatar_url: string | null;
  token_balance?: number | null;
  is_admin?: boolean | null;
  token_pack_notify_at?: string | null;
  subscription_status?: string | null;
  subscription_expires_at?: string | null;
  free_extracts_used?: number | null;
  contribute_to_hub?: boolean | null;
};

export function profileQuota(profile: Profile | null): ProfileQuota | null {
  if (!profile) return null;
  const used = profile.monthly_extracts_used;
  const freeRemaining = freeExtractsRemaining(used);
  const purchasedCredits = Math.max(0, profile.token_balance);
  return {
    subscriptionStatus: 'free',
    subscriptionActive: false,
    freeExtractsUsed: used,
    freeExtractsRemaining: freeRemaining,
    monthlyExtractsUsed: used,
    monthlyExtractsRemaining: null,
    extractsRemaining: freeRemaining + purchasedCredits,
    purchasedCredits,
    totalCredits: freeRemaining + purchasedCredits,
  };
}

function mapProfileRow(row: ProfileRow, monthlyExtractsUsed: number): Profile {
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
    monthly_extracts_used: monthlyExtractsUsed,
    contribute_to_hub: row.contribute_to_hub !== false,
  };
}

async function loadProfileRow(userId: string) {
  return supabase.from('profiles').select(PROFILE_SELECT).eq('id', userId).maybeSingle();
}

async function ensureProfileRow(userId: string): Promise<void> {
  const { error } = await supabase.rpc('ensure_user_profile', { p_user_id: userId });
  if (error) throw error;
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const yearMonth = currentYearMonthUtc();
  let [{ data: profileRow, error: profileError }, monthlyResult] = await Promise.all([
    loadProfileRow(userId),
    supabase
      .from('extract_usage_monthly')
      .select('extract_count')
      .eq('user_id', userId)
      .eq('year_month', yearMonth)
      .maybeSingle(),
  ]);

  if (profileError) throw profileError;

  if (!profileRow) {
    try {
      await ensureProfileRow(userId);
    } catch {
      return null;
    }
    const repaired = await loadProfileRow(userId);
    if (repaired.error) throw repaired.error;
    profileRow = repaired.data;
    if (!profileRow) return null;
  }

  const monthlyExtractsUsed =
    !monthlyResult.error && typeof monthlyResult.data?.extract_count === 'number'
      ? monthlyResult.data.extract_count
      : 0;

  return mapProfileRow(profileRow as ProfileRow, monthlyExtractsUsed);
}

/** Admin support adjustment for a user's non-expiring recipe credits. */
export async function adminAdjustRecipeCredits(
  userId: string,
  amount: number,
  reason = 'support_adjustment',
): Promise<number> {
  const { data, error } = await supabase.rpc('admin_grant_recipe_credits', {
    p_user_id: userId,
    p_amount: amount,
    p_reason: reason,
  });
  if (error) throw error;
  return Number(data);
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
