import { describe, expect, it } from 'vitest';

import type { Ingredient } from '@/types/recipe';

import { convertStepAmounts } from './convertStepAmounts';

const popcorn: Ingredient[] = [
  { name: 'גרגירי תירס לפופקורן', quantity: 0.5, unit: 'כוסות', metric: { quantity: 93, unit: 'g' }, spoons: { quantity: 0.5, unit: 'cup' } },
  { name: 'שמן צמחי', quantity: 3, unit: 'כפות', metric: { quantity: 45, unit: 'ml' }, spoons: { quantity: 3, unit: 'tbsp' } },
  { name: 'מלח', quantity: 0.5, unit: 'כפיות', metric: { quantity: 3, unit: 'g' }, spoons: { quantity: 0.5, unit: 'tsp' } },
  { name: 'חמאה ללא מלח', quantity: 2, unit: 'כפות', metric: { quantity: 28, unit: 'g' }, spoons: { quantity: 2, unit: 'tbsp' } },
];

const english: Ingredient[] = [
  { name: 'Unsalted butter', quantity: 2, unit: 'tbsp', metric: { quantity: 28, unit: 'g' }, spoons: { quantity: 2, unit: 'tbsp' } },
  { name: 'Salt', quantity: 0.5, unit: 'tsp', metric: { quantity: 3, unit: 'g' }, spoons: { quantity: 0.5, unit: 'tsp' } },
  { name: 'Flour', quantity: 240, unit: 'g', metric: { quantity: 240, unit: 'g' }, spoons: { quantity: 2, unit: 'cup' } },
];

describe('convertStepAmounts', () => {
  it('rewrites Hebrew spoon amounts into grams and ml by ingredient', () => {
    const step = 'חממו 3 כפות שמן צמחי בסיר גדול (בנפח של לפחות 4 ליטר). הוסיפו 2 כפות חמאה ללא מלח ו־½ כפית מלח.';
    expect(convertStepAmounts(step, popcorn, 'metric', 'he')).toBe(
      'חממו 45 מ״ל שמן צמחי בסיר גדול (בנפח של לפחות 4 ליטר). הוסיפו 28 גרם חמאה ללא מלח ו־3 גרם מלח.',
    );
  });

  it('handles English units, "of", and partial amounts', () => {
    expect(convertStepAmounts('Melt 1 tablespoon of unsalted butter.', english, 'metric')).toBe(
      'Melt 14 g of unsalted butter.',
    );
  });

  it('converts grams back to spoons in spoons mode', () => {
    expect(convertStepAmounts('Whisk in 120 g flour.', english, 'original')).toBe('Whisk in 1 cup flour.');
  });

  it('converts ranges', () => {
    expect(convertStepAmounts('Add 1-2 tbsp butter.', english, 'metric')).toBe('Add 14–28 g butter.');
  });

  it('leaves amounts that do not belong to an ingredient', () => {
    const step = 'Use a 4 liter pot and 1 cup of water.';
    expect(convertStepAmounts(step, english, 'metric')).toBe(step);
  });

  it('leaves amounts already in the chosen system', () => {
    expect(convertStepAmounts('Add 28 g butter.', english, 'metric')).toBe('Add 28 g butter.');
  });
});
