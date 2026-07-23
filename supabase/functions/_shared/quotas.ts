import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

import {
  FREE_EXTRACT_LIMIT,
  GUEST_EXTRACT_LIMIT,
  PLUS_MONTHLY_EXTRACT_LIMIT,
} from './pricing.ts';

export type SubscriptionStatus = 'free' | 'active' | 'canceled';

export interface QuotaSnapshot {
  subscriptionStatus: SubscriptionStatus;
  subscriptionActive: boolean;
  freeExtractsUsed: number;
  freeExtractsRemaining: number;
  monthlyExtractsUsed: number;
  monthlyExtractsRemaining: number | null;
  extractsRemaining: number;
}

export function currentYearMonthUtc(date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export async function isSubscriptionActive(
  admin: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await admin.rpc('is_subscription_active', {
    p_user_id: userId,
  });
  if (error) {
    console.error('[quotas] isSubscriptionActive', error);
    return false;
  }
  return data === true;
}

export async function getQuotaSnapshot(
  admin: SupabaseClient,
  userId: string,
): Promise<QuotaSnapshot | null> {
  const { data: profile, error } = await admin
    .from('profiles')
    .select('subscription_status, subscription_expires_at, free_extracts_used')
    .eq('id', userId)
    .maybeSingle();

  if (error || profile == null) {
    console.error('[quotas] getQuotaSnapshot profile', error);
    return null;
  }

  const subscriptionStatus = normalizeSubscriptionStatus(profile.subscription_status);
  const expiresAt =
    typeof profile.subscription_expires_at === 'string'
      ? Date.parse(profile.subscription_expires_at)
      : null;
  const subscriptionActive =
    subscriptionStatus === 'active' &&
    (expiresAt == null || Number.isNaN(expiresAt) || expiresAt > Date.now());

  const freeExtractsUsed =
    typeof profile.free_extracts_used === 'number' ? profile.free_extracts_used : 0;
  const freeExtractsRemaining = Math.max(0, FREE_EXTRACT_LIMIT - freeExtractsUsed);

  let monthlyExtractsUsed = 0;
  if (subscriptionActive) {
    const yearMonth = currentYearMonthUtc();
    const { data: monthly, error: monthlyError } = await admin
      .from('extract_usage_monthly')
      .select('extract_count')
      .eq('user_id', userId)
      .eq('year_month', yearMonth)
      .maybeSingle();
    if (monthlyError) {
      console.error('[quotas] getQuotaSnapshot monthly', monthlyError);
    }
    monthlyExtractsUsed =
      typeof monthly?.extract_count === 'number' ? monthly.extract_count : 0;
  }

  const monthlyExtractsRemaining = subscriptionActive
    ? Math.max(0, PLUS_MONTHLY_EXTRACT_LIMIT - monthlyExtractsUsed)
    : null;

  return {
    subscriptionStatus,
    subscriptionActive,
    freeExtractsUsed,
    freeExtractsRemaining,
    monthlyExtractsUsed,
    monthlyExtractsRemaining,
    extractsRemaining: subscriptionActive
      ? (monthlyExtractsRemaining ?? 0)
      : freeExtractsRemaining,
  };
}

function normalizeSubscriptionStatus(value: unknown): SubscriptionStatus {
  if (value === 'active' || value === 'canceled') return value;
  return 'free';
}

/**
 * Pre-check whether the user can start a billable extract (not a reserve).
 */
export async function canStartExtract(
  admin: SupabaseClient,
  userId: string,
): Promise<
  | { ok: true; snapshot: QuotaSnapshot }
  | {
      ok: false;
      code: 'subscription_required' | 'monthly_limit' | 'error';
      snapshot: QuotaSnapshot | null;
    }
> {
  const snapshot = await getQuotaSnapshot(admin, userId);
  if (!snapshot) {
    return { ok: false, code: 'error', snapshot: null };
  }
  if (snapshot.subscriptionActive) {
    if ((snapshot.monthlyExtractsRemaining ?? 0) <= 0) {
      return { ok: false, code: 'monthly_limit', snapshot };
    }
    return { ok: true, snapshot };
  }
  if (snapshot.freeExtractsRemaining <= 0) {
    return { ok: false, code: 'subscription_required', snapshot };
  }
  return { ok: true, snapshot };
}

/**
 * Atomically reserves one extract against free or Plus monthly quota.
 */
export async function reserveSignedInExtract(
  admin: SupabaseClient,
  userId: string,
): Promise<
  | { ok: true; snapshot: QuotaSnapshot }
  | {
      ok: false;
      code: 'subscription_required' | 'monthly_limit' | 'metering_error';
      snapshot: QuotaSnapshot | null;
    }
> {
  const active = await isSubscriptionActive(admin, userId);

  if (active) {
    const { data, error } = await admin.rpc('reserve_monthly_extract', {
      p_user_id: userId,
      p_year_month: currentYearMonthUtc(),
      p_limit: PLUS_MONTHLY_EXTRACT_LIMIT,
    });
    if (error) {
      console.error('[quotas] reserve_monthly_extract', error);
      return {
        ok: false,
        code: 'metering_error',
        snapshot: await getQuotaSnapshot(admin, userId),
      };
    }
    const newCount = typeof data === 'number' ? data : Number(data);
    if (!Number.isFinite(newCount) || newCount < 0) {
      return {
        ok: false,
        code: 'monthly_limit',
        snapshot: await getQuotaSnapshot(admin, userId),
      };
    }
    const snapshot = await getQuotaSnapshot(admin, userId);
    if (!snapshot) {
      return { ok: false, code: 'metering_error', snapshot: null };
    }
    return { ok: true, snapshot };
  }

  const { data, error } = await admin.rpc('reserve_free_extract', {
    p_user_id: userId,
    p_limit: FREE_EXTRACT_LIMIT,
  });
  if (error) {
    console.error('[quotas] reserve_free_extract', error);
    return {
      ok: false,
      code: 'metering_error',
      snapshot: await getQuotaSnapshot(admin, userId),
    };
  }
  const newCount = typeof data === 'number' ? data : Number(data);
  if (!Number.isFinite(newCount) || newCount < 0) {
    return {
      ok: false,
      code: 'subscription_required',
      snapshot: await getQuotaSnapshot(admin, userId),
    };
  }
  const snapshot = await getQuotaSnapshot(admin, userId);
  if (!snapshot) {
    return { ok: false, code: 'metering_error', snapshot: null };
  }
  return { ok: true, snapshot };
}

export async function getGuestExtractCount(
  admin: SupabaseClient,
  installId: string,
): Promise<number> {
  const { data, error } = await admin
    .from('guest_usage')
    .select('extract_count')
    .eq('install_id', installId)
    .maybeSingle();

  if (error) {
    console.error('[quotas] getGuestExtractCount', error);
    return 0;
  }
  return typeof data?.extract_count === 'number' ? data.extract_count : 0;
}

/**
 * Atomically reserves one guest extraction if under the limit.
 * Returns remaining after reservation, or blocked when over limit.
 */
export async function reserveGuestExtraction(
  admin: SupabaseClient,
  installId: string,
): Promise<
  { remaining: number } | { blocked: true; remaining: 0 } | { error: true }
> {
  const { data, error } = await admin.rpc('reserve_guest_extraction', {
    p_install_id: installId,
    p_limit: GUEST_EXTRACT_LIMIT,
  });

  if (error) {
    console.error('[quotas] reserveGuestExtraction', error);
    return { error: true as const };
  }

  const newCount = typeof data === 'number' ? data : Number(data);
  if (!Number.isFinite(newCount) || newCount < 0) {
    return { blocked: true, remaining: 0 as const };
  }

  return { remaining: GUEST_EXTRACT_LIMIT - newCount };
}

export function guestRemainingFromCount(count: number): number {
  return Math.max(0, GUEST_EXTRACT_LIMIT - count);
}

export function quotaFields(snapshot: QuotaSnapshot | null | undefined) {
  if (!snapshot) {
    return {
      subscription_status: null as string | null,
      extracts_remaining: null as number | null,
      free_extracts_remaining: null as number | null,
      monthly_extracts_remaining: null as number | null,
    };
  }
  return {
    subscription_status: snapshot.subscriptionStatus,
    extracts_remaining: snapshot.extractsRemaining,
    free_extracts_remaining: snapshot.freeExtractsRemaining,
    monthly_extracts_remaining: snapshot.monthlyExtractsRemaining,
  };
}
