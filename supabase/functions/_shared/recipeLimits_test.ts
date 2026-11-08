// npx deno test -A --no-lock supabase/functions/_shared/recipeLimits_test.ts

import { assertEquals } from 'jsr:@std/assert@1';

import { fitRecipeToLimits, RECIPE_LIMITS } from './recipeLimits.ts';
import { normalizeRecipeTags } from './tags.ts';

const withinLimits = {
  title: 'Carrot Soup',
  ingredients: [{ name: 'carrot', quantity: 2, unit: '', metric: { quantity: 120, unit: 'g' } }],
  instructions: [{ step: 1, text: 'Simmer', timestamp_seconds: 12 }],
  tags: ['soup'],
  servings: 4,
  estimated_time_minutes: 30,
  calories: 600,
  cost_estimate: '$',
};

Deno.test('a recipe within the limits comes back unchanged', () => {
  assertEquals(fitRecipeToLimits(withinLimits), withinLimits);
});

Deno.test('fields that are absent stay absent', () => {
  assertEquals(fitRecipeToLimits({ instructions: [{ step: 1, text: 'Mix' }] }), {
    instructions: [{ step: 1, text: 'Mix' }],
  });
});

Deno.test('a cooking time of 0 minutes is stored as unknown', () => {
  assertEquals(fitRecipeToLimits({ estimated_time_minutes: 0 }).estimated_time_minutes, null);
});

Deno.test('a cooking time over two days is stored as unknown', () => {
  assertEquals(fitRecipeToLimits({ estimated_time_minutes: 2_881 }).estimated_time_minutes, null);
  assertEquals(fitRecipeToLimits({ estimated_time_minutes: 2_880 }).estimated_time_minutes, 2_880);
});

Deno.test('cooking time and calories are stored as whole numbers', () => {
  const fitted = fitRecipeToLimits({ estimated_time_minutes: 45.4, calories: 512.6 });
  assertEquals(fitted.estimated_time_minutes, 45);
  assertEquals(fitted.calories, 513);
});

Deno.test('calories outside 0–10,000 are stored as unknown', () => {
  assertEquals(fitRecipeToLimits({ calories: 90_000 }).calories, null);
  assertEquals(fitRecipeToLimits({ calories: -5 }).calories, null);
  assertEquals(fitRecipeToLimits({ calories: 0 }).calories, 0);
});

Deno.test('servings are clamped to 1–100', () => {
  assertEquals(fitRecipeToLimits({ servings: 0 }).servings, 1);
  assertEquals(fitRecipeToLimits({ servings: 150 }).servings, 100);
  assertEquals(fitRecipeToLimits({ servings: 2.6 }).servings, 3);
});

Deno.test('a long title is trimmed and cut to 120 characters', () => {
  const fitted = fitRecipeToLimits({ title: `  ${'t'.repeat(130)}  ` });
  assertEquals(fitted.title, 't'.repeat(120));
});

Deno.test('cutting text never splits an emoji', () => {
  const title = `${'t'.repeat(119)}🥕🥕`;
  const fitted = fitRecipeToLimits({ title });
  assertEquals(fitted.title, `${'t'.repeat(119)}🥕`);
  assertEquals(Array.from(fitted.title!).length, RECIPE_LIMITS.titleChars);
});

Deno.test('ingredients are cut to 60, with names cut to 100 characters', () => {
  const ingredients = Array.from({ length: 61 }, (_, i) => ({
    name: i === 0 ? 'n'.repeat(101) : `item ${i}`,
    quantity: 1,
    unit: 'g',
  }));
  const fitted = fitRecipeToLimits({ ingredients }).ingredients!;
  assertEquals(fitted.length, 60);
  assertEquals(fitted[0], { name: 'n'.repeat(100), quantity: 1, unit: 'g' });
});

Deno.test('quantities are clamped to 0–10,000', () => {
  const fitted = fitRecipeToLimits({
    ingredients: [
      { name: 'water', quantity: 20_000, unit: 'ml' },
      { name: 'salt', quantity: -1, unit: 'g' },
      { name: 'pepper', quantity: Number.NaN, unit: '' },
    ],
  }).ingredients!;
  assertEquals(fitted.map((item) => item.quantity), [10_000, 0, 0]);
});

Deno.test('steps are cut to 40, with text cut to 800 characters and timestamps kept', () => {
  const instructions = Array.from({ length: 41 }, (_, i) => ({
    step: i + 1,
    text: i === 0 ? 's'.repeat(801) : `Step ${i + 1}`,
    timestamp_seconds: i,
  }));
  const fitted = fitRecipeToLimits({ instructions }).instructions!;
  assertEquals(fitted.length, 40);
  assertEquals(fitted[0], { step: 1, text: 's'.repeat(800), timestamp_seconds: 0 });
});

Deno.test('tags are cut to 10, each at most 30 characters', () => {
  const tags = Array.from({ length: 11 }, (_, i) => `${'t'.repeat(35)}${i}`);
  const fitted = fitRecipeToLimits({ tags }).tags!;
  assertEquals(fitted.length, 10);
  assertEquals(fitted.every((tag) => tag.length === 30), true);
});

Deno.test('the tag cleanup keeps tags within the 30-character limit', () => {
  assertEquals(normalizeRecipeTags([`#${'Mediterranean '.repeat(3)}`]), [
    'mediterranean mediterranean me',
  ]);
});
