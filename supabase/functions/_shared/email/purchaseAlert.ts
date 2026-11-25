// "Pinch sale" email to the team for each credit pack sold, on any store. sendPurchaseEmail
// sends it right after the buyer's receipt. Best effort, like the receipt: a failure here never
// fails the webhook.
// It goes to support@pinch-app.io. Optional secret PURCHASE_ALERT_EMAIL: another address, or
// `none` to turn the alerts off.
import type { Db } from '../core/supabaseAdmin.ts';

import { escapeHtml, purchaseStore, type PurchaseStore, type RenderedEmail } from './render.ts';
import { sendOnce } from './send.ts';
import { SUPPORT_INBOX } from './support.ts';

export const PURCHASE_ALERT_FROM = 'Pinch sales <hello@pinch-app.io>';

export interface PurchaseAlertInput {
  userId: string;
  /** The buyer's account address, or null when it couldn't be read. */
  buyerEmail: string | null;
  credits: number;
  provider: string;
  transactionId: string;
  /** RevenueCat's store (APP_STORE, PLAY_STORE, …) or 'paddle' / 'polar'. */
  store: string | null;
  purchasedAt: Date | null;
  /** A test purchase (TestFlight, Play testers): nobody paid. */
  sandbox?: boolean;
  /** What the buyer paid, when the store's webhook says. */
  price?: SalePrice | null;
}

export interface SalePrice {
  amount: number;
  /** ISO 4217 code, upper case. */
  currency: string;
  /** The same in US dollars, when the buyer paid in another currency and the store reports it. */
  usd?: number | null;
}

/** "4.99 USD", or "17.90 ILS (4.99 USD)" when the store also gave the dollar amount. */
export function formatSalePrice(price: SalePrice): string {
  const paid = `${price.amount.toFixed(2)} ${price.currency}`;
  return typeof price.usd === 'number' ? `${paid} (${price.usd.toFixed(2)} USD)` : paid;
}

const STORE_NAMES: Record<PurchaseStore, string> = {
  app_store: 'App Store',
  play_store: 'Google Play',
  polar: 'Web (Polar)',
  paddle: 'Web (Paddle)',
  other: 'Other store',
};

/** Where alerts go: PURCHASE_ALERT_EMAIL when it's an address, null when it's `none`, else support@. */
export function purchaseAlertRecipient(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim();
  if (value.toLowerCase() === 'none') return null;
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) ? value : SUPPORT_INBOX;
}

/** 2026-11-25 14:03 UTC */
function formatWhen(date: Date): string {
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

export function renderPurchaseAlertEmail(input: PurchaseAlertInput): RenderedEmail {
  const storeName = STORE_NAMES[purchaseStore(input.store)];
  const price = input.price ? formatSalePrice(input.price) : null;
  const subject = [
    `${input.sandbox ? 'Pinch test sale' : 'Pinch sale'}: ${input.credits} credits`,
    storeName,
    // The subject has only what was paid; the dollar amount beside it is in the body.
    input.price ? formatSalePrice({ ...input.price, usd: null }) : null,
  ]
    .filter((part) => part !== null)
    .join(', ');
  const text = [
    input.sandbox ? 'Sandbox test purchase. Nobody paid.\n' : null,
    `Credits: ${input.credits}`,
    price ? `Price: ${price}` : null,
    `Store: ${storeName}`,
    `Buyer: ${input.buyerEmail ?? 'unknown'}`,
    `Account: ${input.userId}`,
    `When: ${formatWhen(input.purchasedAt ?? new Date())}`,
    `Reference: ${input.transactionId}`,
  ]
    .filter((line) => line !== null)
    .join('\n');
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>
<body><div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;white-space:pre-wrap;word-break:break-word;">${escapeHtml(text)}</div></body></html>`;
  return { subject, html, text };
}

export async function sendPurchaseAlert(admin: Db, input: PurchaseAlertInput): Promise<void> {
  try {
    const to = purchaseAlertRecipient(Deno.env.get('PURCHASE_ALERT_EMAIL'));
    if (!to) return;
    await sendOnce(admin, {
      // email_sends allows only three kinds; the `alert/` prefix keeps this apart from the
      // buyer's receipt, which is stored under `<provider>/<transaction>`.
      kind: 'purchase',
      dedupeKey: `alert/${input.provider}/${input.transactionId}`,
      userId: input.userId,
      to,
      from: PURCHASE_ALERT_FROM,
      email: renderPurchaseAlertEmail(input),
    });
  } catch (error) {
    console.error('[purchase-alert] could not send', input.provider, input.transactionId, error);
  }
}
