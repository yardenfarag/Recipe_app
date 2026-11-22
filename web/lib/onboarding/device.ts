/**
 * What this browser remembers about first-run onboarding (PIN-140). The account keeps the lasting answer
 * (`user_metadata.onboarded_at`, shared/lib/onboardingAccount.ts); these only steer the next visit.
 *
 * - `pinch:onboardingComplete`: this browser has been in before (onboarded, or signed in). A signed-out visit to the
 *   front door then goes to sign-in instead of the welcome page. The Expo web app wrote the same key, so people who
 *   onboarded there aren't welcomed again.
 * - `pinch:onboardingPending`: onboarding started here and isn't finished. Holds the account's id, or `new` between
 *   "Get started" and the account existing (an email confirmation may open in another tab). The signed-in pages send
 *   that account back to finish it, as long as the account is still new and hasn't finished elsewhere.
 *
 * Storage can be blocked (private windows, settings): every read then answers "nothing stored".
 */
import { ONBOARDING_COMPLETE_KEY, isOnboardingCompleteValue } from "@shared/lib/onboardingStorage";

export const ONBOARDING_PENDING_KEY = "pinch:onboardingPending";
/** The pending value before the account exists. */
export const PENDING_NEW_ACCOUNT = "new";

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the account still remembers what matters.
  }
}

export function isReturningBrowser(): boolean {
  return isOnboardingCompleteValue(read(ONBOARDING_COMPLETE_KEY));
}

export function rememberReturningBrowser(): void {
  if (!isReturningBrowser()) write(ONBOARDING_COMPLETE_KEY, "true");
}

/** True when onboarding was started on this browser for this account (or before any account existed). */
export function isOnboardingPendingFor(userId: string): boolean {
  const pending = read(ONBOARDING_PENDING_KEY);
  return pending === userId || pending === PENDING_NEW_ACCOUNT;
}

export function setOnboardingPending(userId: string = PENDING_NEW_ACCOUNT): void {
  write(ONBOARDING_PENDING_KEY, userId);
}

export function clearOnboardingPending(): void {
  write(ONBOARDING_PENDING_KEY, null);
}

/** Onboarding is over on this browser: finished, skipped, or not needed for this account. */
export function finishOnboardingOnDevice(): void {
  clearOnboardingPending();
  rememberReturningBrowser();
}
