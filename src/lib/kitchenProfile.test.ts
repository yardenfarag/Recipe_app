import { describe, expect, it } from 'vitest';

import {
  EMPTY_KITCHEN_PROFILE,
  addPantryStaple,
  kitchenInstruction,
  sanitizeKitchenProfile,
} from './kitchenProfile';

describe('sanitizeKitchenProfile', () => {
  it('drops unknown diets and empty swaps', () => {
    expect(
      sanitizeKitchenProfile({
        diets: ['vegan', 'custom', 'nope'],
        alwaysSwap: [{ from: 'butter', to: 'oil' }, { from: '', to: 'x' }],
        autoApplyOnExtract: true,
        defaultServings: 3,
      }),
    ).toEqual({
      diets: ['vegan'],
      alwaysSwap: [{ from: 'butter', to: 'oil' }],
      autoApplyOnExtract: true,
      defaultServings: 3,
      pantryStaples: [],
    });
  });

  it('defaults missing JSON to empty prefs', () => {
    expect(sanitizeKitchenProfile(null)).toEqual(EMPTY_KITCHEN_PROFILE);
  });

  it('keeps pantry staples and drops empties', () => {
    expect(
      sanitizeKitchenProfile({
        pantryStaples: [' olive oil ', '', 'salt', 'salt'],
      }),
    ).toEqual({
      ...EMPTY_KITCHEN_PROFILE,
      pantryStaples: ['olive oil', 'salt'],
    });
  });
});

describe('kitchenInstruction', () => {
  it('returns null when there is nothing to apply', () => {
    expect(kitchenInstruction(EMPTY_KITCHEN_PROFILE)).toBeNull();
  });

  it('builds a remix instruction from diets and swaps', () => {
    const text = kitchenInstruction({
      diets: ['dairy_free'],
      alwaysSwap: [{ from: 'cream', to: 'oat cream' }],
      autoApplyOnExtract: true,
      defaultServings: 2,
      pantryStaples: [],
    });
    expect(text).toContain('dairy free');
    expect(text).toContain('2 servings');
    expect(text).toContain('cream');
  });
});

describe('addPantryStaple', () => {
  it('keeps prior staples when applied to the latest profile', () => {
    const first = addPantryStaple(EMPTY_KITCHEN_PROFILE, 'salt');
    const second = addPantryStaple(first, 'olive oil');
    expect(second.pantryStaples).toEqual(['salt', 'olive oil']);
  });
});
