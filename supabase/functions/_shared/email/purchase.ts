// "Your credits are in" email after a credit pack is granted. Called by both purchase webhooks
// once grant_purchased_credits succeeds. Best effort: a failure here never fails the webhook,
// because the credits are already in the account.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { pickLocale } from './copy.ts';
import { purchaseStore, renderPurchaseEmail } from './render.ts';
import { sendOnce } from './send.ts';

export interface PurchaseEmailInput {
  userId: string;
  credits: number;
  balance: number | null;
  provider: 'revenuecat' | 'paddle' | 'polar';
  transactionId: string;
  /** RevenueCat's store (APP_STORE, PLAY_STORE, …) or 'paddle' / 'polar'. */
  store: string | null;
  purchasedAt: Date | null;
}

export async function sendPurchaseEmail(admin: SupabaseClient, input: PurchaseEmailInput): Promise<void> {
  try {
    if (!Deno.env.get('RESEND_API_KEY')) return;
    const { data, error } = await admin.auth.admin.getUserById(input.userId);
    if (error) throw error;
    const user = data.user;
    const to = (user?.email ?? '').trim();
    if (!to) return;

    await sendOnce(admin, {
      kind: 'purchase',
      dedupeKey: `${input.provider}/${input.transactionId}`,
      userId: input.userId,
      to,
      email: renderPurchaseEmail({
        locale: pickLocale(user?.user_metadata?.locale),
        credits: input.credits,
        balance: input.balance,
        store: purchaseStore(input.store),
        date: input.purchasedAt ?? new Date(),
        reference: input.transactionId,
      }),
    });
  } catch (error) {
    console.error('[purchase-email] could not send', input.provider, input.transactionId, error);
  }
}
