import { describe, expect, it } from 'vitest';

import { recipeTagI18nKey, translateRecipeTag } from '@/lib/recipeTags';

describe('recipeTagI18nKey', () => {
  it('normalizes spaces, hyphens, and punctuation', () => {
    expect(recipeTagI18nKey('Side Dish')).toBe('side_dish');
    expect(recipeTagI18nKey('gluten-free')).toBe('gluten_free');
    expect(recipeTagI18nKey('sautéed')).toBe('sauteed');
  });
});

describe('translateRecipeTag', () => {
  it('uses the i18n key when present', () => {
    const t = (key: string) => (key === 'recipeTags.vegan' ? 'טבעוני' : key);
    expect(translateRecipeTag('vegan', t as never)).toBe('טבעוני');
  });

  it('title-cases unknown tags', () => {
    const t = (_key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? _key;
    expect(translateRecipeTag('family dinner', t as never)).toBe('Family Dinner');
  });
});
