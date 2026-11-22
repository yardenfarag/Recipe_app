// npx -y deno test -A --no-lock eval/nutrition_test.ts

import { assertEquals } from 'jsr:@std/assert@1';

import { type NutritionCase, scoreNutrition } from './nutrition.ts';

const soup: NutritionCase = {
  id: 'soup',
  lang: 'en',
  title: 'Soup',
  servings: 4,
  ingredients: [],
  steps: [],
  per_serving: { calories: 324, protein_g: 16, carbs_g: 46, fat_g: 8 },
};

Deno.test('totals are compared per serving, with percent and gram slack', () => {
  const score = scoreNutrition(soup, {
    calories: 1300,
    nutrition: { protein_g: 64, carbs_g: 260, fat_g: 52 },
  });
  assertEquals(score.caloriesOk, true);
  // 16 / 65 / 13 g per serving: protein exact, carbs 41% off, fat 5 g off (inside the 6 g slack).
  assertEquals(score.macrosOk, { protein_g: true, carbs_g: false, fat_g: true });
  assertEquals(score.got, { calories: 325, protein_g: 16, carbs_g: 65, fat_g: 13 });
});

Deno.test('calories far off, no macros, or no answer', () => {
  assertEquals(scoreNutrition(soup, { calories: 4000, nutrition: null }), {
    caloriesOk: false,
    macrosOk: null,
    got: { calories: 1000 },
  });
  assertEquals(scoreNutrition(soup, undefined), { caloriesOk: false, macrosOk: null, got: null });
});
