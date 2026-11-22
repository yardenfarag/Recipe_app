import { describe, expect, it } from 'vitest';

import { ONBOARDING_COMPLETE_KEY, isOnboardingCompleteValue, parseOnboardingStep } from './onboardingStorage';

describe('onboarding device keys', () => {
  it('keeps the key the Expo apps already stored', () => {
    expect(ONBOARDING_COMPLETE_KEY).toBe('pinch:onboardingComplete');
  });

  it('only counts the exact stored value as done', () => {
    expect(isOnboardingCompleteValue('true')).toBe(true);
    expect(isOnboardingCompleteValue('1')).toBe(false);
    expect(isOnboardingCompleteValue(null)).toBe(false);
  });

  it('resumes at a valid step, else the first', () => {
    expect(parseOnboardingStep('3', 7)).toBe(3);
    expect(parseOnboardingStep('7', 7)).toBe(0);
    expect(parseOnboardingStep('x', 7)).toBe(0);
    expect(parseOnboardingStep(null, 7)).toBe(0);
  });
});
