import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { GUEST_EXTRACT_LIMIT } from './pricing.ts';

export async function getTokenBalance(
  admin: SupabaseClient,
  userId: string,
): Promise<number | null> {
  const { data, error } = await admin
    .from('profiles')
    .select('token_balance')
    .eq('id', userId)
    .maybeSingle();

  if (error || data == null) {
    console.error('[tokens] getTokenBalance', error);
    return null;
  }
  return typeof data.token_balance === 'number' ? data.token_balance : 0;
}

export async function spendTokens(
  admin: SupabaseClient,
  userId: string,
  amount: number,
  reason: string,
  refId?: string | null,
  metadata: Record<string, unknown> = {},
): Promise<{ ok: true; balance: number } | { ok: false; code: 'insufficient_tokens' | 'error' }> {
  const { data, error } = await admin.rpc('spend_tokens', {
    p_user_id: userId,
    p_amount: amount,
    p_reason: reason,
    p_ref_id: refId ?? null,
    p_metadata: metadata,
  });

  if (error) {
    const message = error.message?.toLowerCase() ?? '';
    if (message.includes('insufficient_tokens')) {
      return { ok: false, code: 'insufficient_tokens' };
    }
    console.error('[tokens] spendTokens', error);
    return { ok: false, code: 'error' };
  }

  return { ok: true, balance: typeof data === 'number' ? data : Number(data) };
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
    console.error('[tokens] getGuestExtractCount', error);
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
    console.error('[tokens] reserveGuestExtraction', error);
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
