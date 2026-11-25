// npx deno test -A --no-lock supabase/functions/_shared/recipeDiets_test.ts

import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';

import {
  buildDietsUserText,
  deriveRecipeDiets,
  DIETS_SCHEMA,
  DIETS_SYSTEM_PROMPT,
  HUB_CONTAINS_KEYS,
  HUB_DIET_KEYS,
  sanitizeContains,
  sanitizeDiets,
} from './recipeDiets.ts';
import { completion, failure, STEAK, withModel } from '../../testing/applianceModelStub.ts';

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

Deno.test('the schema asks for a boolean for every diet and every food', () => {
  assertEquals(DIETS_SCHEMA.required, ['diets', 'contains']);
  assertEquals(DIETS_SCHEMA.properties.diets.required, [...HUB_DIET_KEYS]);
  assertEquals(Object.keys(DIETS_SCHEMA.properties.diets.properties), [...HUB_DIET_KEYS]);
  assertEquals(DIETS_SCHEMA.properties.contains.required, [...HUB_CONTAINS_KEYS]);
  assertEquals(Object.keys(DIETS_SCHEMA.properties.contains.properties), [...HUB_CONTAINS_KEYS]);
});

Deno.test('halal and kosher are Hub diets, with the rules a recipe can show (PIN-180)', () => {
  assertEquals(HUB_DIET_KEYS.includes('halal'), true);
  assertEquals(HUB_DIET_KEYS.includes('kosher'), true);
  assertStringIncludes(DIETS_SYSTEM_PROMPT, '- halal:');
  assertStringIncludes(DIETS_SYSTEM_PROMPT, '- kosher:');
  // The ticket's examples, so a prompt edit can't drop them unnoticed.
  assertStringIncludes(DIETS_SYSTEM_PROMPT, 'a cheeseburger IS halal');
  assertStringIncludes(DIETS_SYSTEM_PROMPT, 'a cheeseburger is NOT kosher');
  assertStringIncludes(DIETS_SYSTEM_PROMPT, 'a beef stew with red wine IS kosher');
});

Deno.test('sanitizeDiets: halal and kosher imply nothing and are implied by nothing', () => {
  assertEquals(sanitizeDiets({ diets: ['vegan'] })?.includes('halal'), false);
  assertEquals(sanitizeDiets({ diets: ['halal', 'kosher'] }), ['halal', 'kosher']);
});

Deno.test('sanitizeContains reads the per-food answer or a list, in a fixed order', () => {
  assertEquals(sanitizeContains({ contains: { pork: true, milk: true, onion: false, soy: 'yes' } }), ['milk', 'pork']);
  assertEquals(sanitizeContains({ contains: ['Onion', 'gluten', 'caviar'] }), ['gluten', 'onion']);
  assertEquals(sanitizeContains({ contains: Object.fromEntries(HUB_CONTAINS_KEYS.map((k) => [k, false])) }), []);
  assertEquals(sanitizeContains({ contains: { unrelated: true } }), null);
  assertEquals(sanitizeContains({ diets: {} }), null);
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

function answer(diets: string[], contains: string[]) {
  return {
    diets: Object.fromEntries(HUB_DIET_KEYS.map((k) => [k, diets.includes(k)])),
    contains: Object.fromEntries(HUB_CONTAINS_KEYS.map((k) => [k, contains.includes(k)])),
  };
}

Deno.test('deriveRecipeDiets returns the sanitized lists and one usage', async () => {
  await withModel([completion(answer(['gluten_free', 'keto', 'kosher'], ['milk']))], async (stub) => {
    const result = await deriveRecipeDiets(STEAK);
    assertEquals(result.diets, ['gluten_free', 'low_carb', 'keto', 'kosher']);
    assertEquals(result.contains, ['milk']);
    assertEquals(result.usages.length, 1);
    assertEquals(result.error, undefined);
    assertEquals(stub.calls.length, 1);
  });
});

Deno.test('deriveRecipeDiets sets neither list when the answer has only one', async () => {
  await withModel([completion({ diets: answer(['vegan'], []).diets })], async () => {
    const result = await deriveRecipeDiets(STEAK);
    assertEquals(result.diets, null);
    assertEquals(result.contains, null);
    assertEquals(result.error, 'diets_not_a_list');
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
    assertEquals(result, { diets: null, contains: null, usages: [] });
    assertEquals(stub.calls.length, 0);
  });
});
