import { describe, expect, it } from 'vitest';

import { formatRecipeDuration } from './formatRecipeDuration';

describe('formatRecipeDuration', () => {
  it('keeps short times in minutes', () => {
    expect(formatRecipeDuration(20)).toBe('20 min');
    expect(formatRecipeDuration(59)).toBe('59 min');
  });

  it('shows whole hours without minutes', () => {
    expect(formatRecipeDuration(60)).toBe('1 hr');
    expect(formatRecipeDuration(120)).toBe('2 hr');
  });

  it('combines hours and minutes', () => {
    expect(formatRecipeDuration(105)).toBe('1 hr 45 min');
    expect(formatRecipeDuration(90)).toBe('1 hr 30 min');
    expect(formatRecipeDuration(61)).toBe('1 hr 1 min');
  });

  it('rounds fractional input', () => {
    expect(formatRecipeDuration(104.6)).toBe('1 hr 45 min');
  });

  it('returns empty for invalid values', () => {
    expect(formatRecipeDuration(0)).toBe('');
    expect(formatRecipeDuration(NaN)).toBe('');
  });
});
