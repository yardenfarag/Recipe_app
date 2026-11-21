/**
 * Coming back from Polar's hosted checkout on the website. Polar sends the buyer to the page they started from with
 * `?checkout_id=…` (supabase/functions/_shared/billing/polarPurchase.ts, `checkoutReturnUrl`), and polar-webhook adds
 * the credits moments later. These helpers spot that return and work out which purchases count.
 *
 * Used by the Expo web app (src/lib/webCheckoutReturn.ts) and the new web app (web/lib/credits). Storage is the
 * caller's: these functions only take and return values.
 */

/** The query parameter Polar fills in on the success URL. */
export const CHECKOUT_ID_PARAM = 'checkout_id';

/** Without a recorded start (another tab, cleared storage), look this far back for the purchase. */
export const CHECKOUT_FALLBACK_WINDOW_MS = 30 * 60 * 1000;

/** Slack for clock differences between the browser and the database. */
const CLOCK_SLACK_MS = 60_000;

export function checkoutIdFrom(href: string): string | null {
  try {
    return new URL(href).searchParams.get(CHECKOUT_ID_PARAM) || null;
  } catch {
    return null;
  }
}

export function withoutCheckoutId(href: string): string {
  const url = new URL(href);
  url.searchParams.delete(CHECKOUT_ID_PARAM);
  return url.toString();
}

/**
 * When the checkout began, as an ISO time to compare purchase rows against: a minute before `startedAt`, or the
 * fallback window when the start is missing, in the future, or too old to be this checkout.
 */
export function checkoutSinceIso(startedAt: number | null | undefined, now: number = Date.now()): string {
  const started = Number(startedAt);
  const valid =
    Number.isFinite(started) && started > 0 && started <= now && now - started < CHECKOUT_FALLBACK_WINDOW_MS;
  return new Date((valid ? started : now - CHECKOUT_FALLBACK_WINDOW_MS) - CLOCK_SLACK_MS).toISOString();
}

const CREDITS_CHANGED_EVENT = 'pinch:credits-changed';

/** Tells everything showing a balance on this page to read it again (after a purchase lands, or credits are spent). */
export function announceCreditsChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(CREDITS_CHANGED_EVENT));
}

export function onCreditsChanged(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(CREDITS_CHANGED_EVENT, listener);
  return () => window.removeEventListener(CREDITS_CHANGED_EVENT, listener);
}
