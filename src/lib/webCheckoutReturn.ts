/**
 * Coming back from Polar's hosted checkout on the website (src/lib/purchases.ts). Polar sends
 * the buyer to the page they started from with ?checkout_id=…, and polar-webhook adds the
 * credits moments later. These helpers spot that return and find the purchase once it lands.
 */
const STARTED_KEY = 'pinch.webCheckoutStartedAt';
const CREDITS_CHANGED_EVENT = 'pinch:credits-changed';
/** Without a recorded start (another tab, cleared storage), look this far back. */
const FALLBACK_WINDOW_MS = 30 * 60 * 1000;

export function checkoutIdFrom(href: string): string | null {
  try {
    return new URL(href).searchParams.get('checkout_id') || null;
  } catch {
    return null;
  }
}

export function withoutCheckoutId(href: string): string {
  const url = new URL(href);
  url.searchParams.delete('checkout_id');
  return url.toString();
}

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
  const valid = Number.isFinite(started) && started > 0 && started <= now && now - started < FALLBACK_WINDOW_MS;
  // A minute of slack for clock differences between this device and the database.
  return new Date((valid ? started : now - FALLBACK_WINDOW_MS) - 60_000).toISOString();
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
  const { supabase } = await import('@/lib/supabase/client');
  const { data, error } = await supabase
    .from('token_ledger')
    .select('delta')
    .eq('user_id', userId)
    .eq('reason', 'recipe_credit_purchase')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  const delta = Number(data?.[0]?.delta);
  return Number.isFinite(delta) && delta > 0 ? delta : null;
}

/** Tells every mounted useProfile to reload the balance. */
export function announceCreditsChanged(): void {
  window.dispatchEvent(new Event(CREDITS_CHANGED_EVENT));
}

export function onCreditsChanged(listener: () => void): () => void {
  window.addEventListener(CREDITS_CHANGED_EVENT, listener);
  return () => window.removeEventListener(CREDITS_CHANGED_EVENT, listener);
}
