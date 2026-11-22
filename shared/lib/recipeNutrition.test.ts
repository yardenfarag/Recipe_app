import { describe, expect, it } from 'vitest';

import { getNutritionDisplay, parseRecipeNutrition, recipeNutritionOf } from './recipeNutrition';

const nutrition = { protein_g: 120, carbs_g: 160, fat_g: 72 };

describe('getNutritionDisplay', () => {
  it('keeps per serving fixed and scales the total with the chosen servings', () => {
    expect(getNutritionDisplay(nutrition, 4, 4)).toEqual({
      perServing: { protein_g: 30, carbs_g: 40, fat_g: 18 },
      total: nutrition,
    });
    expect(getNutritionDisplay(nutrition, 4, 6)).toEqual({
      perServing: { protein_g: 30, carbs_g: 40, fat_g: 18 },
      total: { protein_g: 180, carbs_g: 240, fat_g: 108 },
    });
  });

  it('rounds to whole grams', () => {
    expect(getNutritionDisplay({ protein_g: 10, carbs_g: 1, fat_g: 5 }, 3, 1)?.perServing).toEqual({
      protein_g: 3,
      carbs_g: 0,
      fat_g: 2,
    });
  });

  it('shows nothing without nutrition', () => {
    expect(getNutritionDisplay(null, 4, 4)).toBeNull();
    expect(getNutritionDisplay(undefined, 4, 4)).toBeNull();
  });
});

describe('recipeNutritionOf', () => {
  it('shows macros only next to Pinch calories', () => {
    expect(recipeNutritionOf({ calories: 1800, nutrition })).toEqual(nutrition);
    expect(recipeNutritionOf({ calories: undefined, nutrition })).toBeNull();
    expect(recipeNutritionOf({ calories: 1800, nutrition, locked_fields: ['calories'] })).toBeNull();
    expect(recipeNutritionOf({ calories: 1800, nutrition, locked_fields: ['tags'] })).toEqual(nutrition);
  });
});

describe('parseRecipeNutrition', () => {
  it('accepts the stored shape and rejects anything else', () => {
    expect(parseRecipeNutrition({ protein_g: 30.4, carbs_g: 40, fat_g: 18 })).toEqual({ protein_g: 30, carbs_g: 40, fat_g: 18 });
    expect(parseRecipeNutrition({ protein_g: 30, carbs_g: 40 })).toBeNull();
    expect(parseRecipeNutrition({ protein_g: '30', carbs_g: 40, fat_g: 18 })).toBeNull();
    expect(parseRecipeNutrition({ protein_g: -1, carbs_g: 40, fat_g: 18 })).toBeNull();
    expect(parseRecipeNutrition({ protein_g: 2501, carbs_g: 40, fat_g: 18 })).toBeNull();
    expect(parseRecipeNutrition([30, 40, 18])).toBeNull();
  });
});
