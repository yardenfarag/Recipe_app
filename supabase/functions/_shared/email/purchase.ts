// "Your credits are in" email after a credit pack is granted, then a "Pinch sale" alert to the
// team (purchaseAlert.ts). Called by every purchase webhook once grant_purchased_credits
// succeeds. Best effort: a failure here never fails the webhook, because the credits are already
// in the account.
import type { Db } from '../core/supabaseAdmin.ts';

import { pickLocale } from './copy.ts';
import { sendPurchaseAlert } from './purchaseAlert.ts';
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
  /** A test purchase nobody paid for. Only the team's alert says so. */
  sandbox?: boolean;
}

/** Free credits every account gets each calendar month (UTC); src/lib/quotas.ts has the same number. */
export const FREE_MONTHLY_CREDITS = 10;

/** What the app shows as the balance: purchased credits plus this month's unused free ones. */
export function totalCredits(purchased: number, monthlyUsed: number): number {
  return Math.max(0, purchased) + Math.max(0, FREE_MONTHLY_CREDITS - Math.max(0, monthlyUsed));
}

/** The balance to print, or null (the email then leaves the line out) if it can't be read. */
async function displayBalance(admin: Db, userId: string, purchased: number | null): Promise<number | null> {
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

export async function sendPurchaseEmail(admin: Db, input: PurchaseEmailInput): Promise<void> {
  if (!Deno.env.get('RESEND_API_KEY')) return;

  let buyerEmail: string | null = null;
  try {
    const { data, error } = await admin.auth.admin.getUserById(input.userId);
    if (error) throw error;
    const user = data.user;
    buyerEmail = (user?.email ?? '').trim() || null;

    if (buyerEmail) {
      await sendOnce(admin, {
        kind: 'purchase',
        dedupeKey: `${input.provider}/${input.transactionId}`,
        userId: input.userId,
        to: buyerEmail,
        email: renderPurchaseEmail({
          locale: pickLocale(user?.user_metadata?.locale),
          credits: input.credits,
          balance: await displayBalance(admin, input.userId, input.balance),
          store: purchaseStore(input.store),
          date: input.purchasedAt ?? new Date(),
          reference: input.transactionId,
        }),
      });
    }
  } catch (error) {
    console.error('[purchase-email] could not send', input.provider, input.transactionId, error);
  }

  // The team hears about the sale even when the receipt couldn't go out.
  await sendPurchaseAlert(admin, {
    userId: input.userId,
    buyerEmail,
    credits: input.credits,
    provider: input.provider,
    transactionId: input.transactionId,
    store: input.store,
    purchasedAt: input.purchasedAt,
    sandbox: input.sandbox,
  });
}
