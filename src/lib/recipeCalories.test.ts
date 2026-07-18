import { describe, expect, it } from 'vitest';

import { getCalorieDisplay, resolveRecipeCalories } from '@/lib/recipeCalories';

describe('resolveRecipeCalories', () => {
  it('keeps a normal total/servings split', () => {
    expect(resolveRecipeCalories(520, 2)).toEqual({
      totalCalories: 520,
      perServing: 260,
    });
  });

  it('fixes per-serving mislabeled as total with a large yield', () => {
    // 55 mini cookies: Gemini returned 55 kcal (per cookie) and servings=55
    expect(resolveRecipeCalories(55, 55)).toEqual({
      totalCalories: 3025,
      perServing: 55,
    });
  });

  it('does not over-correct a low-cal side dish', () => {
    expect(resolveRecipeCalories(80, 4)).toEqual({
      totalCalories: 80,
      perServing: 20,
    });
  });
});

describe('getCalorieDisplay', () => {
  it('scales total with the active servings stepper', () => {
    expect(getCalorieDisplay(520, 2, 4)).toEqual({
      perServing: 260,
      total: 1040,
    });
  });
});
