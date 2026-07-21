import { describe, expect, it } from 'vitest';

import { localizeCulinaryUnit } from './culinaryUnits';
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

  it('omits English count placeholders like unit/pc', () => {
    expect(formatQuantity(1, 'unit')).toBe('1');
    expect(formatQuantity(2, 'pcs')).toBe('2');
  });

  it('localizes units when a language is provided', () => {
    expect(formatQuantity(1, 'cup', 'he')).toBe('1 כוס');
    expect(formatQuantity(2, 'cups', 'he')).toBe('2 כוסות');
    expect(formatQuantity(1, 'unit', 'he')).toBe('1');
    expect(formatQuantity(3, 'tbsp', 'he')).toBe('3 כפות');
  });
});

describe('localizeCulinaryUnit', () => {
  it('maps common English units into Hebrew', () => {
    expect(localizeCulinaryUnit('tbsp', 'he', 1)).toBe('כף');
    expect(localizeCulinaryUnit('g', 'he', 200)).toBe('גרם');
  });
});
