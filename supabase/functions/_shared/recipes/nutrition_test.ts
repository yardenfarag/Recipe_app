// npx deno test -A --no-lock supabase/functions/_shared/recipes/nutrition_test.ts

import { assertEquals } from 'jsr:@std/assert@1';

import { normalizeStoredNutrition, nutritionFitsCalories } from './nutrition.ts';
import { fitRecipeToLimits } from './recipeLimits.ts';

Deno.test('macros that fit the calories are stored in whole grams', () => {
  // 4×120 + 4×200 + 9×60 = 1,820 kcal against 1,900.
  assertEquals(
    normalizeStoredNutrition({ calories: 1900, protein_g: 120.4, carbs_g: 199.6, fat_g: 60 }, 4),
    { protein_g: 120, carbs_g: 200, fat_g: 60 },
  );
});

Deno.test('macros more than 35% away from the calories are dropped', () => {
  // 4×30 + 4×40 + 9×18 = 442 kcal against 1,900.
  assertEquals(normalizeStoredNutrition({ calories: 1900, protein_g: 30, carbs_g: 40, fat_g: 18 }, 4), null);
});

Deno.test('macros get the same per-serving fix as the calories', () => {
  // 48 cookies, 150 kcal "total" is one cookie: everything is multiplied by 48.
  assertEquals(
    normalizeStoredNutrition({ calories: 150, protein_g: 2, carbs_g: 20, fat_g: 7 }, 48),
    { protein_g: 96, carbs_g: 960, fat_g: 336 },
  );
});

Deno.test('no calories, a missing amount, a negative or a string means no macros', () => {
  assertEquals(normalizeStoredNutrition({ protein_g: 10, carbs_g: 10, fat_g: 10 }, 2), null);
  assertEquals(normalizeStoredNutrition({ calories: 400, protein_g: 10, carbs_g: 50 }, 2), null);
  assertEquals(normalizeStoredNutrition({ calories: 400, protein_g: -1, carbs_g: 50, fat_g: 10 }, 2), null);
  assertEquals(normalizeStoredNutrition({ calories: 400, protein_g: '10', carbs_g: 50, fat_g: 10 }, 2), null);
});

Deno.test('a near-zero recipe keeps near-zero macros', () => {
  assertEquals(nutritionFitsCalories({ protein_g: 0, carbs_g: 1, fat_g: 0 }, 5), true);
  assertEquals(nutritionFitsCalories({ protein_g: 20, carbs_g: 20, fat_g: 0 }, 5), false);
});

Deno.test('fitRecipeToLimits drops out-of-shape nutrition and nutrition without calories', () => {
  assertEquals(
    fitRecipeToLimits({ calories: 600, nutrition: { protein_g: 30.6, carbs_g: 60, fat_g: 25 } }).nutrition,
    { protein_g: 31, carbs_g: 60, fat_g: 25 },
  );
  assertEquals(fitRecipeToLimits({ calories: 600, nutrition: { protein_g: 3000, carbs_g: 0, fat_g: 0 } }).nutrition, null);
  assertEquals(fitRecipeToLimits({ calories: 90_000, nutrition: { protein_g: 30, carbs_g: 60, fat_g: 25 } }).nutrition, null);
  assertEquals(fitRecipeToLimits({ calories: null, nutrition: { protein_g: 30, carbs_g: 60, fat_g: 25 } }).nutrition, null);
  assertEquals('nutrition' in fitRecipeToLimits({ calories: 600 }), false);
});
