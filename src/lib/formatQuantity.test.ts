import { describe, expect, it } from 'vitest';

import { formatQuantity } from './formatQuantity';

describe('formatQuantity', () => {
  it('returns "a pinch" for tiny teaspoon amounts', () => {
    expect(formatQuantity(0.05, 'tsp')).toBe('a pinch');
  });

  it('snaps decimals to common cooking fractions', () => {
    expect(formatQuantity(0.25, 'cup')).toBe('¼ cup');
    expect(formatQuantity(1.5, 'cups')).toBe('1½ cups');
  });

  it('floors sub-threshold non-pinching units to the smallest fraction', () => {
    expect(formatQuantity(0.05, 'g')).toBe('⅛ g');
  });
});
