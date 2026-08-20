import { describe, expect, it } from 'vitest';

import { displayIngredientAmount } from './displayIngredientAmount';
import {
  pickIngredientAmount,
  readIngredientAmount,
  scaleIngredient,
  scaleIngredients,
} from './ingredientAmounts';

const flour = {
  name: 'flour',
  quantity: 1,
  unit: 'cup',
  metric: { quantity: 120, unit: 'g' },
  spoons: { quantity: 1, unit: 'cup' },
};

const milk = {
  name: 'milk',
  quantity: 240,
  unit: 'ml',
  metric: { quantity: 240, unit: 'ml' },
  spoons: { quantity: 1, unit: 'cup' },
};

describe('pickIngredientAmount', () => {
  it('uses extracted grams for solids instead of converting cups to ml', () => {
    expect(pickIngredientAmount(flour, 'metric')).toEqual({ quantity: 120, unit: 'g' });
    expect(pickIngredientAmount(flour, 'original')).toEqual({ quantity: 1, unit: 'cup' });
  });

  it('uses extracted ml for liquids and cups in spoons mode', () => {
    expect(pickIngredientAmount(milk, 'metric')).toEqual({ quantity: 240, unit: 'ml' });
    expect(pickIngredientAmount(milk, 'original')).toEqual({ quantity: 1, unit: 'cup' });
  });

  it('falls back to unit conversion when dual amounts are missing', () => {
    expect(pickIngredientAmount({ quantity: 1, unit: 'cup' }, 'metric')).toEqual({
      quantity: 240,
      unit: 'ml',
    });
  });
});

describe('scaleIngredients', () => {
  it('scales source, metric, and spoons together', () => {
    const [scaled] = scaleIngredients([flour], 2, 4);
    expect(scaled.quantity).toBe(2);
    expect(scaled.metric).toEqual({ quantity: 240, unit: 'g' });
    expect(scaled.spoons).toEqual({ quantity: 2, unit: 'cup' });
  });
});

describe('scaleIngredient', () => {
  it('scales a swap back to base servings', () => {
    const scaled = scaleIngredient(flour, 0.5);
    expect(scaled.quantity).toBe(0.5);
    expect(scaled.metric).toEqual({ quantity: 60, unit: 'g' });
  });
});

describe('readIngredientAmount', () => {
  it('accepts a valid amount and rejects malformed ones', () => {
    expect(readIngredientAmount({ quantity: 120, unit: 'g' })).toEqual({
      quantity: 120,
      unit: 'g',
    });
    expect(readIngredientAmount({ quantity: 1 })).toBeUndefined();
    expect(readIngredientAmount(null)).toBeUndefined();
  });
});

describe('displayIngredientAmount', () => {
  it('renders extracted grams in grams mode', () => {
    expect(displayIngredientAmount(flour, { system: 'metric' })).toBe('120 g');
    expect(displayIngredientAmount(flour, { system: 'original' })).toBe('1 cup');
  });

  it('localizes extracted dual units', () => {
    expect(displayIngredientAmount(flour, { system: 'metric', language: 'he' })).toBe('120 גרם');
    expect(displayIngredientAmount(flour, { system: 'original', language: 'he' })).toBe('1 כוס');
  });
});
