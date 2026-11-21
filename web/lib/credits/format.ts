/**
 * Numbers on the credits screens, in the app's language. Prices are US dollars: Polar charges in dollars, so the
 * currency stays the same whatever the language, and only the way it is written changes ("$4.99", "4,99 US$").
 */

export function formatUsd(amount: number, language: string): string {
  return new Intl.NumberFormat(language, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatPercent(fraction: number, language: string): string {
  return new Intl.NumberFormat(language, { style: "percent", maximumFractionDigits: 0 }).format(fraction);
}

export function formatCount(count: number, language: string): string {
  return new Intl.NumberFormat(language).format(count);
}

/** When the free credits come back: the start of next month, UTC (shared/lib/quotas.ts counts months in UTC). */
export function nextFreeReset(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/** "December 1", "1 de diciembre", "1 בדצמבר". */
export function formatResetDate(date: Date, language: string): string {
  return new Intl.DateTimeFormat(language, { month: "long", day: "numeric", timeZone: "UTC" }).format(date);
}
