/**
 * Coming back from Polar's hosted checkout on the website (src/lib/purchases.ts). Polar sends
 * the buyer to the page they started from with ?checkout_id=…, and polar-webhook adds the
 * credits moments later. These helpers spot that return and find the purchase once it lands.
 *
 * The platform-free parts live in shared/ (the new web app uses them too); this file adds the
 * Expo web app's session storage.
 */
import { checkoutSinceIso } from '@shared/lib/webCheckoutReturn';

export {
  announceCreditsChanged,
  checkoutIdFrom,
  onCreditsChanged,
  withoutCheckoutId,
} from '@shared/lib/webCheckoutReturn';

const STARTED_KEY = 'pinch.webCheckoutStartedAt';

/** Called right before the tab moves to Polar, so only purchases after it count. */
export function markCheckoutStarted(now: number = Date.now()): void {
  try {
    window.sessionStorage.setItem(STARTED_KEY, String(now));
  } catch {
    // Storage can be blocked; purchaseSince falls back to a time window.
  }
}

/** When this checkout began, as an ISO time to compare ledger rows against. */
export function checkoutStartedSince(now: number = Date.now()): string {
  let started = NaN;
  try {
    started = Number(window.sessionStorage.getItem(STARTED_KEY));
  } catch {
    // Fall through to the window.
  }
  return checkoutSinceIso(started, now);
}

export function clearCheckoutStarted(): void {
  try {
    window.sessionStorage.removeItem(STARTED_KEY);
  } catch {
    // Nothing to clear.
  }
}

/** The credits added by the newest pack purchase since `sinceIso`, or null if none yet. */
export async function purchasedCreditsSince(userId: string, sinceIso: string): Promise<number | null> {
  // The app's client module sets up the shared client first.
  await import('@/lib/supabase/client');
  const { purchasedCreditsSince: since } = await import('@shared/lib/supabase/creditPurchases');
  return since(userId, sinceIso);
}
