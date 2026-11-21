/**
 * Device keys for first-run onboarding, the same in both apps (AsyncStorage on the phone, localStorage on the web;
 * the Expo web app kept AsyncStorage in localStorage under these exact keys, so the new web app reads its answers).
 */

/** Set to 'true' once this install or browser finished (or skipped) first-run onboarding. */
export const ONBOARDING_COMPLETE_KEY = 'pinch:onboardingComplete';

export function isOnboardingCompleteValue(value: string | null): boolean {
  return value === 'true';
}

/** Onboarding step to resume at, so the RTL reload doesn't restart the pager (mobile). */
export const ONBOARDING_STEP_KEY = 'pinch:onboardingStep';

export function parseOnboardingStep(value: string | null, stepCount: number): number {
  const step = Number(value);
  return Number.isInteger(step) && step >= 0 && step < stepCount ? step : 0;
}
