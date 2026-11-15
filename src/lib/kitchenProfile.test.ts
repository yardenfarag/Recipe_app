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
      allergies: [],
      otherAllergies: [],
      dislikes: [],
    });
  });

  it('keeps known allergies in a fixed order and cleans typed items', () => {
    const profile = sanitizeKitchenProfile({
      allergies: ['sesame', 'nope', 'milk', 'milk'],
      otherAllergies: [' Celery ', 'celery', 7],
      dislikes: ['Olives', ''],
      allergyNoticeAcceptedAt: '2026-11-15T10:00:00.000Z',
    });
    expect(profile.allergies).toEqual(['milk', 'sesame']);
    expect(profile.otherAllergies).toEqual(['Celery']);
    expect(profile.dislikes).toEqual(['Olives']);
    expect(profile.allergyNoticeAcceptedAt).toBe('2026-11-15T10:00:00.000Z');
  });

  it('drops a notice date that is not a date', () => {
    expect(sanitizeKitchenProfile({ allergyNoticeAcceptedAt: 'yes' })).toEqual(EMPTY_KITCHEN_PROFILE);
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
      ...EMPTY_KITCHEN_PROFILE,
      diets: ['dairy_free'],
      alwaysSwap: [{ from: 'cream', to: 'oat cream' }],
      autoApplyOnExtract: true,
      defaultServings: 2,
    });
    expect(text).toContain('dairy free');
    expect(text).toContain('2 servings');
    expect(text).toContain('cream');
  });

  it('puts allergies first and dislikes last', () => {
    const text = kitchenInstruction({
      ...EMPTY_KITCHEN_PROFILE,
      diets: ['vegan'],
      allergies: ['peanuts'],
      otherAllergies: ['celery'],
      dislikes: ['olives'],
    })!;
    expect(text.startsWith('I am allergic to peanuts, celery')).toBe(true);
    expect(text.indexOf('vegan')).toBeGreaterThan(0);
    expect(text.endsWith('I do not like olives: leave them out or swap them')).toBe(true);
  });

  it('keeps the allergy sentence when the rest does not fit', () => {
    const text = kitchenInstruction({
      ...EMPTY_KITCHEN_PROFILE,
      allergies: ['milk', 'eggs'],
      alwaysSwap: Array.from({ length: 8 }, (_, i) => ({ from: `${'x'.repeat(55)}${i}`, to: 'y'.repeat(58) })),
    })!;
    expect(text.startsWith('I am allergic to milk and dairy, eggs')).toBe(true);
    expect(text.length).toBeLessThanOrEqual(400);
  });
});

describe('addPantryStaple', () => {
  it('keeps prior staples when applied to the latest profile', () => {
    const first = addPantryStaple(EMPTY_KITCHEN_PROFILE, 'salt');
    const second = addPantryStaple(first, 'olive oil');
    expect(second.pantryStaples).toEqual(['salt', 'olive oil']);
  });
});
