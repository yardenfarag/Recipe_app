import { describe, expect, it } from 'vitest';

import { isOnboardingCompleteValue, parseOnboardingStep } from '@/lib/onboardingStorage';

describe('isOnboardingCompleteValue', () => {
  it('is true only for the stored completion flag', () => {
    expect(isOnboardingCompleteValue('true')).toBe(true);
    expect(isOnboardingCompleteValue(null)).toBe(false);
    expect(isOnboardingCompleteValue('false')).toBe(false);
    expect(isOnboardingCompleteValue('')).toBe(false);
  });
});

describe('parseOnboardingStep', () => {
  it('resumes at a saved step inside the pager', () => {
    expect(parseOnboardingStep('2', 5)).toBe(2);
    expect(parseOnboardingStep('4', 5)).toBe(4);
  });

  it('starts over for missing or out-of-range values', () => {
    expect(parseOnboardingStep(null, 5)).toBe(0);
    expect(parseOnboardingStep('5', 5)).toBe(0);
    expect(parseOnboardingStep('-1', 5)).toBe(0);
    expect(parseOnboardingStep('1.5', 5)).toBe(0);
    expect(parseOnboardingStep('abc', 5)).toBe(0);
  });
});
