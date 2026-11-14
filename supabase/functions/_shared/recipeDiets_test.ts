// npx deno test -A --no-lock supabase/functions/_shared/recipeDiets_test.ts

import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';

import {
  buildDietsUserText,
  deriveRecipeDiets,
  DIETS_SCHEMA,
  HUB_DIET_KEYS,
  sanitizeDiets,
} from './recipeDiets.ts';
import { completion, failure, STEAK, withModel } from './testing/applianceModelStub.ts';

Deno.test('sanitizeDiets keeps known keys in a fixed order and drops the rest', () => {
  assertEquals(sanitizeDiets({ diets: ['high_protein', 'healthier', 'Gluten_Free', 'carnivore', 7] }), [
    'gluten_free',
    'high_protein',
  ]);
});

Deno.test('sanitizeDiets adds the diets a diet implies', () => {
  assertEquals(sanitizeDiets({ diets: ['vegan'] }), ['vegan', 'vegetarian', 'pescatarian', 'dairy_free']);
  assertEquals(sanitizeDiets({ diets: ['keto'] }), ['low_carb', 'keto']);
  assertEquals(sanitizeDiets({ diets: ['paleo'] }), ['gluten_free', 'dairy_free', 'paleo']);
});

Deno.test('sanitizeDiets reads the per-diet true/false answer', () => {
  assertEquals(
    sanitizeDiets({ vegan: false, vegetarian: true, keto: false, paleo: 'yes', gluten_free: true }),
    ['vegetarian', 'pescatarian', 'gluten_free'],
  );
  assertEquals(sanitizeDiets(Object.fromEntries(HUB_DIET_KEYS.map((k) => [k, false]))), []);
  assertEquals(sanitizeDiets({ unrelated: true }), null);
});

Deno.test('the schema asks for a boolean for every diet', () => {
  assertEquals(DIETS_SCHEMA.required, [...HUB_DIET_KEYS]);
  assertEquals(Object.keys(DIETS_SCHEMA.properties), [...HUB_DIET_KEYS]);
});

Deno.test('sanitizeDiets: an empty list is an answer, a non-list is not', () => {
  assertEquals(sanitizeDiets({ diets: [] }), []);
  assertEquals(sanitizeDiets({ diets: 'vegan' }), null);
  assertEquals(sanitizeDiets(null), null);
});

Deno.test('healthier is never a Hub diet', () => {
  assertEquals((HUB_DIET_KEYS as readonly string[]).includes('healthier'), false);
});

Deno.test('buildDietsUserText lists amounts and names, and steps', () => {
  const text = buildDietsUserText(STEAK);
  assertStringIncludes(text, 'Title: Pan-seared steak');
  assertStringIncludes(text, '- 2 tbsp butter');
  assertStringIncludes(text, '- 1 ribeye steak');
  assertStringIncludes(text, '2. Sear in a hot pan');
});

Deno.test('deriveRecipeDiets returns the sanitized list and one usage', async () => {
  const answer = Object.fromEntries(HUB_DIET_KEYS.map((k) => [k, k === 'gluten_free' || k === 'keto']));
  await withModel([completion(answer)], async (stub) => {
    const result = await deriveRecipeDiets(STEAK);
    assertEquals(result.diets, ['gluten_free', 'low_carb', 'keto']);
    assertEquals(result.usages.length, 1);
    assertEquals(result.error, undefined);
    assertEquals(stub.calls.length, 1);
  });
});

Deno.test('deriveRecipeDiets leaves the card unchecked when the model fails', async () => {
  await withModel([failure(500), failure(500), failure(500)], async () => {
    const result = await deriveRecipeDiets(STEAK, { timeoutMs: 2_000 });
    assertEquals(result.diets, null);
    assertEquals(typeof result.error, 'string');
  });
});

Deno.test('deriveRecipeDiets skips the call when there are no ingredients', async () => {
  await withModel([], async (stub) => {
    const result = await deriveRecipeDiets({ title: 'Empty', ingredients: [], instructions: [] });
    assertEquals(result, { diets: null, usages: [] });
    assertEquals(stub.calls.length, 0);
  });
});
