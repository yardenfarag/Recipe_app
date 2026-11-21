import { FunctionsHttpError } from '@supabase/supabase-js';

import type { CreditPackId } from '../creditPacks';
import { supabase } from './client';

/**
 * Buying credit packs on the website, through Polar (supabase/functions/polar-checkout and polar-webhook). The app
 * stores go through RevenueCat in the mobile app instead (src/lib/purchases.ts).
 */

/**
 * Why a checkout couldn't start. `sales_off`: the server has web sales switched off (`CREDIT_PURCHASES_ENABLED`),
 * so the page should say to buy in the app rather than show an error.
 */
export type CheckoutFailure = 'sales_off' | 'unavailable';

export class CheckoutError extends Error {
  constructor(readonly reason: CheckoutFailure) {
    super(reason === 'sales_off' ? 'purchases_disabled' : 'web_checkout_unavailable');
    this.name = 'CheckoutError';
  }
}

/**
 * Asks polar-checkout for a hosted checkout for `packId`, for the signed-in user. Returns Polar's checkout address.
 * `returnUrl` is where Polar sends the buyer after paying; the function keeps only trusted origins and adds
 * `?checkout_id={CHECKOUT_ID}`.
 */
export async function startCreditCheckout(packId: CreditPackId, returnUrl: string | undefined): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{ url?: string; error?: string }>('polar-checkout', {
    body: { pack_id: packId, return_url: returnUrl },
  });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      try {
        const body = (await error.context.json()) as { error?: string };
        if (body?.error === 'purchases_disabled') throw new CheckoutError('sales_off');
      } catch (parsed) {
        if (parsed instanceof CheckoutError) throw parsed;
        // No JSON answer: a plain failure.
      }
    }
    throw new CheckoutError('unavailable');
  }
  if (typeof data?.url !== 'string' || !data.url) throw new CheckoutError('unavailable');
  return data.url;
}

/** The credits added by the newest pack purchase since `sinceIso`, or null if none has landed yet. */
export async function purchasedCreditsSince(userId: string, sinceIso: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('token_ledger')
    .select('delta')
    .eq('user_id', userId)
    .eq('reason', 'recipe_credit_purchase')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  const delta = Number(data?.[0]?.delta);
  return Number.isFinite(delta) && delta > 0 ? delta : null;
}
