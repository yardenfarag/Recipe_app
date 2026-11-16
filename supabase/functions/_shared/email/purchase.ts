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

/** Free credits every account gets each calendar month (UTC); src/lib/quotas.ts has the same number. */
export const FREE_MONTHLY_CREDITS = 10;

/** What the app shows as the balance: purchased credits plus this month's unused free ones. */
export function totalCredits(purchased: number, monthlyUsed: number): number {
  return Math.max(0, purchased) + Math.max(0, FREE_MONTHLY_CREDITS - Math.max(0, monthlyUsed));
}

/** The balance to print, or null (the email then leaves the line out) if it can't be read. */
async function displayBalance(admin: SupabaseClient, userId: string, purchased: number | null): Promise<number | null> {
  if (purchased == null) return null;
  const now = new Date();
  const yearMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const { data, error } = await admin
    .from('extract_usage_monthly')
    .select('extract_count')
    .eq('user_id', userId)
    .eq('year_month', yearMonth)
    .maybeSingle();
  if (error) return null;
  return totalCredits(purchased, Number(data?.extract_count ?? 0) || 0);
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
        balance: await displayBalance(admin, input.userId, input.balance),
        store: purchaseStore(input.store),
        date: input.purchasedAt ?? new Date(),
        reference: input.transactionId,
      }),
    });
  } catch (error) {
    console.error('[purchase-email] could not send', input.provider, input.transactionId, error);
  }
}
