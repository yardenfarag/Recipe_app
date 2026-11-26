import { describe, expect, it } from 'vitest';

import { displayIngredientAmount } from './displayIngredientAmount';
import { scaleIngredients } from './ingredientAmounts';
import { isEgg, roundForKitchen } from './kitchenRounding';
import type { Ingredient } from '../types/recipe';

describe('roundForKitchen', () => {
  it('rounds grams to what a kitchen scale shows', () => {
    expect(roundForKitchen(6.33, 'g', 'salt')).toBe(6);
    expect(roundForKitchen(23.6, 'g', 'butter')).toBe(24);
    expect(roundForKitchen(143, 'g', 'sugar')).toBe(145);
    expect(roundForKitchen(527.8, 'g', 'flour')).toBe(530);
    expect(roundForKitchen(1033, 'g', 'flour')).toBe(1025);
  });

  it('keeps half grams below 5 g and a tenth below 1 g', () => {
    expect(roundForKitchen(2.64, 'g', 'yeast')).toBe(2.5);
    expect(roundForKitchen(0.33, 'g', 'saffron')).toBe(0.3);
    expect(roundForKitchen(0.02, 'g', 'saffron')).toBe(0.1);
  });

  it('rounds millilitres and localized metric units the same way', () => {
    expect(roundForKitchen(237.5, 'ml', 'milk')).toBe(240);
    expect(roundForKitchen(6.33, 'גרם', 'מלח')).toBe(6);
    expect(roundForKitchen(1.27, 'kg', 'potatoes')).toBe(1.25);
  });

  it('keeps eggs whole, never zero', () => {
    expect(roundForKitchen(2.11, '', 'eggs')).toBe(2);
    expect(roundForKitchen(2.5, 'unit', 'eggs')).toBe(3);
    expect(roundForKitchen(1.33, 'pcs', 'egg yolks')).toBe(1);
    expect(roundForKitchen(0.5, '', 'egg')).toBe(1);
    expect(roundForKitchen(2.67, 'large', 'eggs')).toBe(3);
    expect(roundForKitchen(2.11, 'יחידות', 'ביצים')).toBe(2);
  });

  it('keeps cloves, cans and slices whole', () => {
    expect(roundForKitchen(2.67, 'cloves', 'garlic')).toBe(3);
    expect(roundForKitchen(0.33, 'clove', 'garlic')).toBe(1);
    expect(roundForKitchen(1.33, 'can', 'chickpeas')).toBe(1);
    expect(roundForKitchen(3.5, 'שיניים', 'שום')).toBe(4);
  });

  it('halves other counted things', () => {
    expect(roundForKitchen(1.33, '', 'onion')).toBe(1.5);
    expect(roundForKitchen(1.11, 'unit', 'lemon')).toBe(1);
    expect(roundForKitchen(0.2, '', 'red pepper')).toBe(0.5);
    expect(roundForKitchen(1.33, 'stick', 'butter')).toBe(1.5);
  });

  it('leaves spoons, cups and unknown units to the fraction snapping', () => {
    expect(roundForKitchen(1.33, 'cup', 'flour')).toBe(1.33);
    expect(roundForKitchen(0.71, 'tsp', 'salt')).toBe(0.71);
    expect(roundForKitchen(1.33, 'shot', 'espresso')).toBe(1.33);
  });

  it('leaves unknown amounts alone', () => {
    expect(roundForKitchen(0, 'g', 'salt')).toBe(0);
    expect(roundForKitchen(Number.NaN, 'g', 'salt')).toBeNaN();
  });
});

describe('isEgg', () => {
  it('knows eggs in every recipe language, but not eggplant', () => {
    for (const name of ['eggs', 'Large egg', 'egg whites', 'ביצים', 'הביצה', 'huevos', 'яйца', 'البيض', 'œufs', 'Eier', 'yumurta']) {
      expect(isEgg(name), name).toBe(true);
    }
    for (const name of ['eggplant', 'veggie stock', 'חציל', 'onion']) {
      expect(isEgg(name), name).toBe(false);
    }
  });
});

describe('scaled amounts as the cook sees them', () => {
  const recipe: Ingredient[] = [
    { name: 'salt', quantity: 1, unit: 'tsp', metric: { quantity: 6, unit: 'g' }, spoons: { quantity: 1, unit: 'tsp' } },
    { name: 'eggs', quantity: 4, unit: '' },
    { name: 'garlic', quantity: 3, unit: 'cloves' },
    { name: 'onion', quantity: 2, unit: 'unit' },
    { name: 'tomatoes', quantity: 2, unit: 'cans' },
    { name: 'flour', quantity: 2, unit: 'cups', metric: { quantity: 240, unit: 'g' }, spoons: { quantity: 2, unit: 'cups' } },
    { name: 'milk', quantity: 1, unit: 'cup', metric: { quantity: 240, unit: 'ml' }, spoons: { quantity: 1, unit: 'cup' } },
  ];

  const shown = (servings: number, system: 'metric' | 'original') =>
    scaleIngredients(recipe, 18, servings).map((ingredient) => displayIngredientAmount(ingredient, { system, language: 'en' }));

  it('18 → 19 servings reads as amounts you can measure', () => {
    expect(shown(19, 'metric')).toEqual(['6 g', '4', '3 cloves', '2', '2 cans', '250 g', '250 ml']);
    expect(shown(19, 'original')).toEqual(['1 tsp', '4', '3 cloves', '2', '2 cans', '2⅛ cups', '1 cup']);
  });

  it('18 → 7 servings keeps eggs and cloves whole and halves the onion', () => {
    expect(shown(7, 'metric')).toEqual(['2.5 g', '2', '1 clove', '1', '1 can', '95 g', '95 ml']);
  });

  it('18 → 4 servings never rounds an ingredient away', () => {
    expect(shown(4, 'metric')).toEqual(['1.5 g', '1', '1 clove', '½', '1 can', '55 g', '55 ml']);
  });

  it('shows the recipe as written at its own servings', () => {
    const asWritten: Ingredient[] = [{ name: 'yeast', quantity: 2.25, unit: 'g' }, { name: 'eggs', quantity: 1.5, unit: '' }];
    expect(scaleIngredients(asWritten, 4, 4).map((i) => i.quantity)).toEqual([2.25, 1.5]);
  });

  it('rounds from the recipe each time, so going back returns the original', () => {
    scaleIngredients(recipe, 18, 19);
    expect(scaleIngredients(recipe, 18, 18)[0].metric).toEqual({ quantity: 6, unit: 'g' });
  });
});
