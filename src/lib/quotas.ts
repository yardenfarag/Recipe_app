/** Extract quotas and Pinch Plus display pricing (replaces product tokens). */

/** Keep in sync with GUEST_RECIPE_LIMIT — guests shouldn’t extract more than they can save. */
export const GUEST_EXTRACTION_LIMIT = 3;
/** Lifetime free extracts for signed-in non-Plus users. */
export const FREE_EXTRACT_LIMIT = 10;
/** Calendar-month extracts for Pinch Plus (UTC YYYY-MM). */
export const PLUS_MONTHLY_EXTRACT_LIMIT = 90;
/** Display price until real IAP. */
export const PLUS_PRICE_DISPLAY = '$6.99/mo';
export const PLUS_PRICE_NOTE = 'Billing isn’t live yet — upgrade is free for now.';

export type SubscriptionStatus = 'free' | 'active' | 'canceled';

/** Gemini 3.5 Flash list prices used for admin cost tracking. */
export const ADMIN_PRICE_CARD = {
  geminiInputUsdPerM: 1.5,
  geminiOutputUsdPerM: 9.0,
  scrapecreatorsUsdPerCredit: 0.00188,
  freeExtractLimit: FREE_EXTRACT_LIMIT,
  plusMonthlyExtractLimit: PLUS_MONTHLY_EXTRACT_LIMIT,
  guestExtractLimit: GUEST_EXTRACTION_LIMIT,
  plusPriceDisplay: PLUS_PRICE_DISPLAY,
} as const;

export function currentYearMonthUtc(date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function isSubscriptionActive(
  status: SubscriptionStatus | string | null | undefined,
  expiresAt?: string | null,
): boolean {
  if (status !== 'active') return false;
  if (!expiresAt) return true;
  const ms = Date.parse(expiresAt);
  return !Number.isNaN(ms) && ms > Date.now();
}

export function freeExtractsRemaining(used: number): number {
  return Math.max(0, FREE_EXTRACT_LIMIT - Math.max(0, used));
}

export function monthlyExtractsRemaining(used: number): number {
  return Math.max(0, PLUS_MONTHLY_EXTRACT_LIMIT - Math.max(0, used));
}
