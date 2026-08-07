/** Extract quotas and Pinch Plus display pricing (replaces product tokens). */

/** Lifetime guest extracts per install (guests cannot save). */
export const GUEST_EXTRACTION_LIMIT = 3;
/** Calendar-month extracts for signed-in Free users (UTC YYYY-MM). */
export const FREE_MONTHLY_EXTRACT_LIMIT = 15;
/** @deprecated Use FREE_MONTHLY_EXTRACT_LIMIT — free is monthly now. */
export const FREE_EXTRACT_LIMIT = FREE_MONTHLY_EXTRACT_LIMIT;
/** Calendar-month extracts for Pinch Plus (UTC YYYY-MM). */
export const PLUS_MONTHLY_EXTRACT_LIMIT = 100;
/** Display price until real IAP. */
export const PLUS_PRICE_DISPLAY = '$9.99/mo';
/** Self-serve free Plus upgrade is off for go-live until billing ships. */
export const PLUS_SELF_UPGRADE_ENABLED = false;
export const PLUS_PRICE_NOTE = 'Pinch Plus is in development.';

export type SubscriptionStatus = 'free' | 'active' | 'canceled';

/** Gemini 3.5 Flash list prices used for admin cost tracking. */
export const ADMIN_PRICE_CARD = {
  geminiInputUsdPerM: 1.5,
  geminiOutputUsdPerM: 9.0,
  scrapecreatorsUsdPerCredit: 0.00188,
  freeExtractLimit: FREE_MONTHLY_EXTRACT_LIMIT,
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
  return Math.max(0, FREE_MONTHLY_EXTRACT_LIMIT - Math.max(0, used));
}

export function monthlyExtractsRemaining(used: number): number {
  return Math.max(0, PLUS_MONTHLY_EXTRACT_LIMIT - Math.max(0, used));
}
