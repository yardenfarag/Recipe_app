import { type Db, sqlNullable } from './supabaseAdmin.ts';

import {
  FREE_MONTHLY_EXTRACT_LIMIT,
  GUEST_EXTRACT_LIMIT,
} from '../llm/pricing.ts';

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
  /**
   * The credit was already spent on this same request moments ago (the app is retrying after a
   * lost response). The work runs again without a new charge, and a failure refunds nothing.
   */
  replayed?: boolean;
}

/**
 * How long after a credit is spent the same request (same request id, same input) may run again
 * for free. It covers the app retrying after it lost the response; after that, it's a new purchase.
 */
export const CREDIT_REPLAY_WINDOW_MS = 15 * 60_000;

/** A spent key is followed by at most this many paid generations before we stop and report. */
const MAX_KEY_GENERATIONS = 25;

/**
 * The reservation key is the app's request id bound to a hash of what is being bought, so one
 * request id can't pay for different work (a different link, photo or recipe).
 */
export async function scopedIdempotencyKey(requestId: string, scope: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(scope));
  const hex = Array.from(new Uint8Array(digest).slice(0, 8))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `${requestId.trim()}:${hex}`;
}

export interface GuestExtractionReservation {
  reservationId: string;
  remaining: number;
}

export interface CompensationResult {
  confirmed: boolean;
  error: string | null;
}

export function currentYearMonthUtc(date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

async function ensureUserProfile(
  admin: Db,
  userId: string,
): Promise<boolean> {
  const { error } = await admin.rpc('ensure_user_profile', { p_user_id: userId });
  if (error) {
    console.error('[quotas] ensure_user_profile', error);
    return false;
  }
  return true;
}

function parseRpcJson(data: unknown): Record<string, unknown> | null {
  if (data == null) return null;
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data) as unknown;
      return parsed && typeof parsed === 'object'
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  if (typeof data === 'object') return data as Record<string, unknown>;
  return null;
}

export async function getQuotaSnapshot(
  admin: Db,
  userId: string,
): Promise<QuotaSnapshot | null> {
  let { data: profile, error } = await admin
    .from('profiles')
    .select('token_balance')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('[quotas] getQuotaSnapshot profile', error);
    return null;
  }

  if (profile == null) {
    const created = await ensureUserProfile(admin, userId);
    if (!created) return null;
    const retried = await admin
      .from('profiles')
      .select('token_balance')
      .eq('id', userId)
      .maybeSingle();
    if (retried.error) {
      console.error('[quotas] getQuotaSnapshot profile retry', retried.error);
      return null;
    }
    profile = retried.data;
    if (profile == null) return null;
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
  admin: Db,
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

type ReserveResult =
  | { ok: true; reservation: CreditReservation }
  | {
      ok: false;
      code: 'insufficient_credits' | 'metering_error';
      snapshot: QuotaSnapshot | null;
    };

/**
 * Reserves one credit for `requestId` + `scope` (see scopedIdempotencyKey).
 *
 * - A new key, or one still `reserved` (a duplicate of a request in flight), behaves as before.
 * - A key whose credit was spent within `replayWindowMs` comes back with `replayed: true`: the
 *   app lost the response and is retrying, so the work runs again for free.
 * - A key spent longer ago is chained to a new key derived from the spent reservation, so the
 *   retry is a new, idempotent purchase instead of free work forever.
 */
export async function reserveSignedInExtract(
  admin: Db,
  userId: string,
  requestId: string,
  opts: { scope: string; replayWindowMs: number },
): Promise<ReserveResult> {
  const baseKey = await scopedIdempotencyKey(requestId, opts.scope);
  let key = baseKey;
  for (let generation = 0; generation < MAX_KEY_GENERATIONS; generation++) {
    const reserved = await reserveRecipeCredit(admin, userId, key);
    if (!reserved.ok || reserved.status !== 'finalized') return reserved;

    const finalizedAt = await reservationFinalizedAt(admin, userId, reserved.reservation.reservationId);
    if (finalizedAt !== null && Date.now() - finalizedAt < opts.replayWindowMs) {
      return { ok: true, reservation: { ...reserved.reservation, replayed: true } };
    }
    key = `${baseKey}:${reserved.reservation.reservationId}`;
  }
  console.error('[quotas] reserveSignedInExtract: too many spent generations', { userId });
  return { ok: false, code: 'metering_error', snapshot: await getQuotaSnapshot(admin, userId) };
}

async function reservationFinalizedAt(
  admin: Db,
  userId: string,
  reservationId: string,
): Promise<number | null> {
  const { data, error } = await admin
    .from('credit_reservations')
    .select('finalized_at')
    .eq('id', reservationId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) console.error('[quotas] reservationFinalizedAt', error);
  const at = typeof data?.finalized_at === 'string' ? Date.parse(data.finalized_at) : NaN;
  return Number.isFinite(at) ? at : null;
}

async function reserveRecipeCredit(
  admin: Db,
  userId: string,
  idempotencyKey: string,
): Promise<
  | { ok: true; reservation: CreditReservation; status: string }
  | Extract<ReserveResult, { ok: false }>
> {
  const reserveArgs = {
    p_user_id: userId,
    p_year_month: currentYearMonthUtc(),
    p_idempotency_key: idempotencyKey,
    p_free_limit: FREE_MONTHLY_EXTRACT_LIMIT,
  };
  let { data, error } = await admin.rpc('reserve_recipe_credit', reserveArgs);
  if (error && /profile_not_found/i.test(error.message ?? '')) {
    await ensureUserProfile(admin, userId);
    const retried = await admin.rpc('reserve_recipe_credit', reserveArgs);
    data = retried.data;
    error = retried.error;
  }
  if (error) {
    console.error('[quotas] reserve_recipe_credit', error);
    return {
      ok: false,
      code: 'metering_error',
      snapshot: await getQuotaSnapshot(admin, userId),
    };
  }
  let row = parseRpcJson(data);
  if (row?.status === 'refunded') {
    const reopened = await admin.rpc('reopen_refunded_recipe_credit', {
      p_user_id: userId,
      p_year_month: currentYearMonthUtc(),
      p_idempotency_key: idempotencyKey,
      p_free_limit: FREE_MONTHLY_EXTRACT_LIMIT,
    });
    data = reopened.data;
    error = reopened.error;
    if (error) {
      console.error('[quotas] reopen_refunded_recipe_credit', error);
      return {
        ok: false,
        code: 'metering_error',
        snapshot: await getQuotaSnapshot(admin, userId),
      };
    }
    row = parseRpcJson(data);
  }
  if (row?.code === 'insufficient_credits') {
    return {
      ok: false,
      code: 'insufficient_credits',
      snapshot: await getQuotaSnapshot(admin, userId),
    };
  }
  const reservationId =
    typeof row?.reservation_id === 'string' ? row.reservation_id : null;
  const source =
    row?.source === 'monthly_free' || row?.source === 'purchased'
      ? row.source
      : null;
  if (!reservationId || !source) {
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
    status: typeof row?.status === 'string' ? row.status : 'reserved',
    reservation: {
      reservationId,
      source,
      snapshot,
    },
  };
}

export async function finalizeSignedInExtract(
  admin: Db,
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
  admin: Db,
  userId: string,
  reservationId: string,
  reason: string,
): Promise<CompensationResult> {
  const { data, error } = await admin.rpc('refund_recipe_credit', {
    p_user_id: userId,
    p_reservation_id: reservationId,
    p_reason: reason,
  });
  if (error) console.error('[quotas] refund_recipe_credit', error);
  if ((!error && data === true) || await signedInReservationIsRefunded(
    admin,
    userId,
    reservationId,
  )) {
    return { confirmed: true, error: null };
  }
  return {
    confirmed: false,
    error: error?.message ?? 'refund_not_confirmed',
  };
}

export async function refundSignedInExtractAfterFinalizeFailure(
  admin: Db,
  userId: string,
  reservationId: string,
): Promise<CompensationResult> {
  const { data, error } = await admin.rpc(
    'refund_recipe_credit_after_finalize_failure',
    {
      p_user_id: userId,
      p_reservation_id: reservationId,
    },
  );
  if (error) {
    console.error('[quotas] refund_recipe_credit_after_finalize_failure', error);
  }
  if ((!error && data === true) || await signedInReservationIsRefunded(
    admin,
    userId,
    reservationId,
  )) {
    return { confirmed: true, error: null };
  }
  return {
    confirmed: false,
    error: error?.message ?? 'refund_not_confirmed',
  };
}

/**
 * Queues a refund the cleanup job retries. Only an unspent (`reserved`) credit can be queued,
 * unless the server itself just saw finalize fail (`afterFinalizeFailure`): a request from the
 * app must never be able to refund a credit that already paid for a recipe.
 */
export async function markSignedInExtractCompensationPending(
  admin: Db,
  userId: string,
  reservationId: string,
  reason: string,
  errorMessage: string | null,
  opts?: { afterFinalizeFailure?: boolean },
): Promise<boolean> {
  const { data, error } = opts?.afterFinalizeFailure
    ? await admin.rpc('mark_recipe_credit_compensation_after_finalize_failure', {
        p_user_id: userId,
        p_reservation_id: reservationId,
        p_error: sqlNullable(errorMessage),
      })
    : await admin.rpc('mark_recipe_credit_compensation_pending', {
        p_user_id: userId,
        p_reservation_id: reservationId,
        p_reason: reason,
        p_error: sqlNullable(errorMessage),
      });
  if (error) console.error('[quotas] mark compensation pending', error);
  return !error && data === true;
}

export async function getGuestExtractCount(
  admin: Db,
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
  admin: Db,
  installId: string,
  idempotencyKey: string,
): Promise<
  | { ok: true; reservation: GuestExtractionReservation }
  | { blocked: true; remaining: 0 }
  | { error: true }
> {
  const { data, error } = await admin.rpc('reserve_guest_extraction_v2', {
    p_install_id: installId,
    p_idempotency_key: idempotencyKey,
    p_limit: GUEST_EXTRACT_LIMIT,
  });

  if (error) {
    console.error('[quotas] reserveGuestExtraction', error);
    return { error: true as const };
  }

  const row = data as {
    code?: string;
    reservation_id?: string;
    remaining?: number;
  } | null;
  if (row?.code === 'guest_limit') {
    return { blocked: true, remaining: 0 as const };
  }
  if (!row?.reservation_id || !Number.isFinite(Number(row.remaining))) {
    return { error: true as const };
  }

  return {
    ok: true,
    reservation: {
      reservationId: row.reservation_id,
      remaining: Math.max(0, Number(row.remaining)),
    },
  };
}

export async function finalizeGuestExtraction(
  admin: Db,
  installId: string,
  reservationId: string,
): Promise<boolean> {
  const { data, error } = await admin.rpc('finalize_guest_extraction', {
    p_install_id: installId,
    p_reservation_id: reservationId,
  });
  if (error) console.error('[quotas] finalizeGuestExtraction', error);
  return !error && data === true;
}

export async function refundGuestExtraction(
  admin: Db,
  installId: string,
  reservationId: string,
  reason: string,
): Promise<CompensationResult> {
  const { data, error } = await admin.rpc('refund_guest_extraction', {
    p_install_id: installId,
    p_reservation_id: reservationId,
    p_reason: reason,
  });
  if (error) console.error('[quotas] refundGuestExtraction', error);
  if ((!error && data === true) || await guestReservationIsRefunded(
    admin,
    installId,
    reservationId,
  )) {
    return { confirmed: true, error: null };
  }
  return {
    confirmed: false,
    error: error?.message ?? 'refund_not_confirmed',
  };
}

export async function markGuestExtractionCompensationPending(
  admin: Db,
  installId: string,
  reservationId: string,
  reason: string,
  errorMessage: string | null,
): Promise<boolean> {
  const { data, error } = await admin.rpc('mark_guest_extraction_compensation_pending', {
    p_install_id: installId,
    p_reservation_id: reservationId,
    p_reason: reason,
    p_error: sqlNullable(errorMessage),
  });
  if (error) console.error('[quotas] mark_guest_extraction_compensation_pending', error);
  return !error && data === true;
}

async function signedInReservationIsRefunded(
  admin: Db,
  userId: string,
  reservationId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from('credit_reservations')
    .select('status')
    .eq('id', reservationId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) console.error('[quotas] verify signed-in refund', error);
  return !error && data?.status === 'refunded';
}

async function guestReservationIsRefunded(
  admin: Db,
  installId: string,
  reservationId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from('guest_extraction_reservations')
    .select('status')
    .eq('id', reservationId)
    .eq('install_id', installId.trim())
    .maybeSingle();
  if (error) console.error('[quotas] verify guest refund', error);
  return !error && data?.status === 'refunded';
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
