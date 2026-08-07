import { describe, expect, it } from 'vitest';

import { localizeCulinaryUnit, localizeIngredientUnits } from './culinaryUnits';
import { formatQuantity } from './formatQuantity';

describe('formatQuantity', () => {
  it('returns "a pinch" for tiny teaspoon amounts', () => {
    expect(formatQuantity(0.05, 'tsp')).toBe('a pinch');
  });

  it('snaps decimals to common cooking fractions', () => {
    expect(formatQuantity(0.25, 'cup')).toBe('¼ cup');
    expect(formatQuantity(1.5, 'cups')).toBe('1½ cups');
  });

  it('floors sub-threshold non-metric units to the smallest fraction', () => {
    expect(formatQuantity(0.05, 'cup')).toBe('⅛ cup');
  });

  it('formats metric mass/volume as plain decimals', () => {
    expect(formatQuantity(240, 'ml')).toBe('240 ml');
    expect(formatQuantity(0.05, 'g')).toBe('0.05 g');
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

  it('formats metric amounts when the unit is already localized', () => {
    expect(formatQuantity(240, 'מ״ל', 'he')).toBe('240 מ״ל');
    expect(formatQuantity(200, 'גרם', 'he')).toBe('200 גרם');
  });
});

describe('localizeCulinaryUnit', () => {
  it('maps common English units into Hebrew', () => {
    expect(localizeCulinaryUnit('tbsp', 'he', 1)).toBe('כף');
    expect(localizeCulinaryUnit('g', 'he', 200)).toBe('גרם');
  });

  it('round-trips localized units into another language', () => {
    expect(localizeCulinaryUnit('כוס', 'en', 1)).toBe('cup');
    expect(localizeCulinaryUnit('כוס', 'es', 2)).toBe('tazas');
  });
});

describe('localizeIngredientUnits', () => {
  it('localizes known units and leaves freeform units alone', () => {
    const result = localizeIngredientUnits(
      [
        { name: 'flour', quantity: 1, unit: 'cup' },
        { name: 'herbs', quantity: 1, unit: 'handful' },
      ],
      'he',
    );
    expect(result[0].unit).toBe('כוס');
    expect(result[1].unit).toBe('handful');
  });
});
