/** Recipe-credit limits shared by client quota displays. */

/** Lifetime guest extracts per install (guests cannot save). */
export const GUEST_EXTRACTION_LIMIT = 3;
/** Calendar-month extracts for signed-in Free users (UTC YYYY-MM). */
export const FREE_MONTHLY_EXTRACT_LIMIT = 15;
/** @deprecated Use FREE_MONTHLY_EXTRACT_LIMIT — free is monthly now. */
export const FREE_EXTRACT_LIMIT = FREE_MONTHLY_EXTRACT_LIMIT;
export type SubscriptionStatus = 'free' | 'active' | 'canceled';

/** Gemini 3.5 Flash list prices used for admin cost tracking. */
export const ADMIN_PRICE_CARD = {
  geminiInputUsdPerM: 1.5,
  geminiOutputUsdPerM: 9.0,
  scrapecreatorsUsdPerCredit: 0.00188,
  freeExtractLimit: FREE_MONTHLY_EXTRACT_LIMIT,
  guestExtractLimit: GUEST_EXTRACTION_LIMIT,
} as const;

export function currentYearMonthUtc(date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function freeExtractsRemaining(used: number): number {
  return Math.max(0, FREE_MONTHLY_EXTRACT_LIMIT - Math.max(0, used));
}
