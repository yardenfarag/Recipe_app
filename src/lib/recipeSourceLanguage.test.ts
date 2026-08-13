import { describe, expect, it } from 'vitest';

import { resolveRecipeSourceLanguage } from '@/lib/recipeSourceLanguage';

const baseRecipe = {
  title: 'Pasta',
  ingredients: [{ name: 'salt', quantity: 1, unit: 'tsp' }],
  instructions: [{ step: 1, text: 'Mix and cook.' }],
};

describe('resolveRecipeSourceLanguage', () => {
  it('keeps a valid declared language', () => {
    expect(resolveRecipeSourceLanguage({ ...baseRecipe, source_language: 'es' })).toBe('es');
  });

  it('repairs historical Hebrew recipes marked as English', () => {
    expect(
      resolveRecipeSourceLanguage({
        ...baseRecipe,
        source_language: 'en',
        title: 'פסטה ברוטב עגבניות',
      }),
    ).toBe('he');
  });

  it('repairs historical Arabic and Russian recipes marked as English', () => {
    expect(
      resolveRecipeSourceLanguage({ ...baseRecipe, source_language: 'en', title: 'وصفة سهلة' }),
    ).toBe('ar');
    expect(
      resolveRecipeSourceLanguage({ ...baseRecipe, source_language: 'en', title: 'Простой суп' }),
    ).toBe('ru');
  });

  it('requires multiple culinary markers before overriding a Latin recipe', () => {
    expect(
      resolveRecipeSourceLanguage({
        ...baseRecipe,
        source_language: 'en',
        instructions: [{ step: 1, text: 'Añadir los ingredientes y mezcla en una taza.' }],
      }),
    ).toBe('es');
    expect(resolveRecipeSourceLanguage({ ...baseRecipe, title: 'Spanish tortilla' })).toBe('en');
  });
});
