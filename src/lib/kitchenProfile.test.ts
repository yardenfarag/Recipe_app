import { describe, expect, it } from 'vitest';

import {
  EMPTY_KITCHEN_PROFILE,
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
    });
  });

  it('defaults missing JSON to empty prefs', () => {
    expect(sanitizeKitchenProfile(null)).toEqual(EMPTY_KITCHEN_PROFILE);
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
    });
    expect(text).toContain('dairy free');
    expect(text).toContain('2 servings');
    expect(text).toContain('cream');
  });
});
