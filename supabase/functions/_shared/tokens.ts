import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

/** Legacy token helpers — extract/remix no longer spend product tokens. */

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
