import { describe, expect, it } from 'vitest';

import { applyMeasurementSystem, convertToMetric } from './convertMeasurement';

describe('convertToMetric', () => {
  it('converts cups to milliliters', () => {
    expect(convertToMetric(1, 'cup')).toEqual({ quantity: 240, unit: 'ml' });
    expect(convertToMetric(0.25, 'cup')).toEqual({ quantity: 60, unit: 'ml' });
  });

  it('converts spoons to milliliters', () => {
    expect(convertToMetric(2, 'tbsp')).toEqual({ quantity: 30, unit: 'ml' });
    expect(convertToMetric(1, 'tsp')).toEqual({ quantity: 5, unit: 'ml' });
  });

  it('converts weight units to grams', () => {
    expect(convertToMetric(8, 'oz')).toEqual({ quantity: 227, unit: 'g' });
    expect(convertToMetric(1, 'lb')).toEqual({ quantity: 454, unit: 'g' });
  });

  it('normalizes large metric amounts', () => {
    expect(convertToMetric(1500, 'g')).toEqual({ quantity: 1.5, unit: 'kg' });
    expect(convertToMetric(2, 'liter')).toEqual({ quantity: 2, unit: 'liter' });
  });

  it('leaves count units unchanged', () => {
    expect(convertToMetric(3, 'cloves')).toEqual({ quantity: 3, unit: 'cloves' });
    expect(convertToMetric(2, 'pc')).toEqual({ quantity: 2, unit: 'pc' });
    expect(convertToMetric(1, 'pinch')).toEqual({ quantity: 1, unit: 'pinch' });
  });

  it('leaves already-metric small amounts unchanged', () => {
    expect(convertToMetric(200, 'g')).toEqual({ quantity: 200, unit: 'g' });
    expect(convertToMetric(15, 'ml')).toEqual({ quantity: 15, unit: 'ml' });
  });
});

describe('applyMeasurementSystem', () => {
  it('passes through in original mode', () => {
    expect(applyMeasurementSystem(1, 'cup', 'original')).toEqual({ quantity: 1, unit: 'cup' });
  });
});
