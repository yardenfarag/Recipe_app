import { describe, expect, it } from 'vitest';

import { keptOriginalLanguage, stampKeptOriginalLanguage } from './keptOriginal';

const english = {
  title: 'Pancakes',
  servings: 2,
  ingredients: [{ name: 'flour', quantity: 1, unit: 'cup' }],
  instructions: [{ step: 1, text: 'Whisk.' }],
};
const hebrew = { ...english, title: 'פנקייק', ingredients: [{ name: 'קמח', quantity: 1, unit: 'כוס' }] };

describe('keptOriginalLanguage (PIN-188)', () => {
  it('uses the language stored with the original', () => {
    expect(keptOriginalLanguage({ ...english, language: 'en' }, 'es')).toBe('en');
  });

  it('reads an older snapshot as the recipe’s language unless its script says otherwise', () => {
    expect(keptOriginalLanguage(english, 'en')).toBe('en');
    expect(keptOriginalLanguage(english, 'he')).toBe('en');
    expect(keptOriginalLanguage(hebrew, 'en')).toBe('he');
  });
});

describe('stampKeptOriginalLanguage', () => {
  it('writes the language into an original that has none', () => {
    expect(stampKeptOriginalLanguage(english, 'en')).toEqual({ ...english, language: 'en' });
  });

  it('returns null when there is nothing to save', () => {
    expect(stampKeptOriginalLanguage({ ...english, language: 'en' }, 'es')).toBeNull();
    expect(stampKeptOriginalLanguage(undefined, 'en')).toBeNull();
    expect(stampKeptOriginalLanguage(null, 'en')).toBeNull();
  });
});
