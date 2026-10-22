/** AsyncStorage key for one-time first-open onboarding (install-scoped). */
export const ONBOARDING_COMPLETE_KEY = 'pinch:onboardingComplete';

export function isOnboardingCompleteValue(value: string | null): boolean {
  return value === 'true';
}

/** Onboarding step to resume at, so the RTL reload doesn't restart the pager. */
export const ONBOARDING_STEP_KEY = 'pinch:onboardingStep';

export function parseOnboardingStep(value: string | null, stepCount: number): number {
  const step = Number(value);
  return Number.isInteger(step) && step >= 0 && step < stepCount ? step : 0;
}
