import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

import {
  FREE_MONTHLY_EXTRACT_LIMIT,
  GUEST_EXTRACT_LIMIT,
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
  purchasedCredits: number;
  totalCredits: number;
}

export interface CreditReservation {
  reservationId: string;
  source: 'monthly_free' | 'purchased';
  snapshot: QuotaSnapshot;
}

export function currentYearMonthUtc(date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export async function getQuotaSnapshot(
  admin: SupabaseClient,
  userId: string,
): Promise<QuotaSnapshot | null> {
  const { data: profile, error } = await admin
    .from('profiles')
    .select('token_balance')
    .eq('id', userId)
    .maybeSingle();

  if (error || profile == null) {
    console.error('[quotas] getQuotaSnapshot profile', error);
    return null;
  }

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

  const monthlyExtractsUsed =
    typeof monthly?.extract_count === 'number' ? monthly.extract_count : 0;

  const freeExtractsRemaining = Math.max(
    0,
    FREE_MONTHLY_EXTRACT_LIMIT - monthlyExtractsUsed,
  );
  const purchasedCredits =
    typeof profile.token_balance === 'number' ? Math.max(0, profile.token_balance) : 0;

  return {
    subscriptionStatus: 'free',
    subscriptionActive: false,
    freeExtractsUsed: monthlyExtractsUsed,
    freeExtractsRemaining,
    monthlyExtractsUsed,
    monthlyExtractsRemaining: null,
    extractsRemaining: freeExtractsRemaining + purchasedCredits,
    purchasedCredits,
    totalCredits: freeExtractsRemaining + purchasedCredits,
  };
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
      code: 'insufficient_credits' | 'error';
      snapshot: QuotaSnapshot | null;
    }
> {
  const snapshot = await getQuotaSnapshot(admin, userId);
  if (!snapshot) {
    return { ok: false, code: 'error', snapshot: null };
  }
  if (snapshot.totalCredits <= 0) {
    return { ok: false, code: 'insufficient_credits', snapshot };
  }
  return { ok: true, snapshot };
}

/**
 * Atomically reserves one extract against Free or Plus monthly quota.
 */
export async function reserveSignedInExtract(
  admin: SupabaseClient,
  userId: string,
  idempotencyKey: string,
): Promise<
  | { ok: true; reservation: CreditReservation }
  | {
      ok: false;
      code: 'insufficient_credits' | 'metering_error';
      snapshot: QuotaSnapshot | null;
    }
> {
  const { data, error } = await admin.rpc('reserve_recipe_credit', {
    p_user_id: userId,
    p_year_month: currentYearMonthUtc(),
    p_idempotency_key: idempotencyKey,
    p_free_limit: FREE_MONTHLY_EXTRACT_LIMIT,
  });
  if (error) {
    console.error('[quotas] reserve_recipe_credit', error);
    return {
      ok: false,
      code: 'metering_error',
      snapshot: await getQuotaSnapshot(admin, userId),
    };
  }
  const row = data as {
    code?: string;
    reservation_id?: string;
    source?: string;
  } | null;
  if (row?.code === 'insufficient_credits') {
    return {
      ok: false,
      code: 'insufficient_credits',
      snapshot: await getQuotaSnapshot(admin, userId),
    };
  }
  if (
    !row?.reservation_id ||
    (row.source !== 'monthly_free' && row.source !== 'purchased')
  ) {
    return {
      ok: false,
      code: 'metering_error',
      snapshot: await getQuotaSnapshot(admin, userId),
    };
  }
  const snapshot = await getQuotaSnapshot(admin, userId);
  if (!snapshot) {
    return { ok: false, code: 'metering_error', snapshot: null };
  }
  return {
    ok: true,
    reservation: {
      reservationId: row.reservation_id,
      source: row.source,
      snapshot,
    },
  };
}

export async function finalizeSignedInExtract(
  admin: SupabaseClient,
  userId: string,
  reservationId: string,
): Promise<boolean> {
  const { data, error } = await admin.rpc('finalize_recipe_credit', {
    p_user_id: userId,
    p_reservation_id: reservationId,
  });
  if (error) console.error('[quotas] finalize_recipe_credit', error);
  return !error && data === true;
}

export async function refundSignedInExtract(
  admin: SupabaseClient,
  userId: string,
  reservationId: string,
  reason: string,
): Promise<boolean> {
  const { data, error } = await admin.rpc('refund_recipe_credit', {
    p_user_id: userId,
    p_reservation_id: reservationId,
    p_reason: reason,
  });
  if (error) console.error('[quotas] refund_recipe_credit', error);
  return !error && data === true;
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
      purchased_credits: null as number | null,
      total_credits: null as number | null,
    };
  }
  return {
    subscription_status: snapshot.subscriptionStatus,
    extracts_remaining: snapshot.extractsRemaining,
    free_extracts_remaining: snapshot.freeExtractsRemaining,
    monthly_extracts_remaining: snapshot.monthlyExtractsRemaining,
    purchased_credits: snapshot.purchasedCredits,
    total_credits: snapshot.totalCredits,
  };
}
