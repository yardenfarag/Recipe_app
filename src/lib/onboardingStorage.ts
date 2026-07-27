/** AsyncStorage key for one-time first-open onboarding (install-scoped). */
export const ONBOARDING_COMPLETE_KEY = 'pinch:onboardingComplete';

export function isOnboardingCompleteValue(value: string | null): boolean {
  return value === 'true';
}
