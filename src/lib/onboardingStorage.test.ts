import { describe, expect, it } from 'vitest';

import { isOnboardingCompleteValue } from '@/lib/onboardingStorage';

describe('isOnboardingCompleteValue', () => {
  it('is true only for the stored completion flag', () => {
    expect(isOnboardingCompleteValue('true')).toBe(true);
    expect(isOnboardingCompleteValue(null)).toBe(false);
    expect(isOnboardingCompleteValue('false')).toBe(false);
    expect(isOnboardingCompleteValue('')).toBe(false);
  });
});
