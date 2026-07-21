import { describe, expect, it } from 'vitest';

import {
  isRecipeLanguageCode,
  isRtlRecipeLanguage,
  RECIPE_LANGUAGES,
} from '@/lib/recipeLanguages';

describe('recipeLanguages', () => {
  it('includes the launch language set', () => {
    expect(RECIPE_LANGUAGES.map((l) => l.code)).toEqual([
      'en',
      'es',
      'he',
      'ru',
      'ar',
      'de',
      'fr',
    ]);
  });

  it('validates codes and RTL', () => {
    expect(isRecipeLanguageCode('he')).toBe(true);
    expect(isRecipeLanguageCode('pt')).toBe(false);
    expect(isRtlRecipeLanguage('he')).toBe(true);
    expect(isRtlRecipeLanguage('ar')).toBe(true);
    expect(isRtlRecipeLanguage('en')).toBe(false);
  });
});
