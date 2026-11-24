import { assertEquals, assertThrows } from 'jsr:@std/assert@1';

import { HttpError } from '../core/httpError.ts';
import { parseTranslateRequest } from './translateRequest.ts';

const valid = () => ({
  target_language: ' HE ',
  recipe: {
    title: '  Tomato soup ',
    ingredients: [{ name: ' tomato ', quantity: 3, unit: ' pcs ', metric: { quantity: 300, unit: 'g' } }],
    instructions: [{ step: 1, text: ' Chop. ', timestamp_seconds: 12.6 }],
  },
});

/** The exact 400 body a request gets. */
function rejection(body: unknown): [number, string] {
  try {
    parseTranslateRequest(body);
  } catch (err) {
    if (err instanceof HttpError) return [err.status, JSON.stringify(err.body)];
    throw err;
  }
  throw new Error('expected a rejection');
}

const error400 = (message: string): [number, string] => [400, JSON.stringify({ error: message })];

Deno.test('a valid request is trimmed and normalised as before', () => {
  assertEquals(parseTranslateRequest(valid()), {
    targetLanguage: 'he',
    title: 'Tomato soup',
    ingredients: [{ name: 'tomato', quantity: 3, unit: 'pcs', metric: { quantity: 300, unit: 'g' } }],
    instructions: [{ step: 1, text: 'Chop.', timestamp_seconds: 13 }],
  });
});

Deno.test('a missing unit becomes an empty string; bad metric/spoons amounts are dropped', () => {
  const body = valid();
  body.recipe.ingredients = [{ name: 'salt', quantity: 0, metric: { quantity: Number.NaN, unit: 'g' } } as never];
  assertEquals(parseTranslateRequest(body).ingredients, [{ name: 'salt', quantity: 0, unit: '' }]);
});

Deno.test('every bad request keeps its old { error } body', () => {
  const language = 'Missing or invalid "target_language". Use: en, es, he, ru, ar, de, fr.';
  assertEquals(rejection({ ...valid(), target_language: undefined }), error400(language));
  assertEquals(rejection({ ...valid(), target_language: 'it' }), error400(language));

  const withRecipe = (recipe: Record<string, unknown>) => ({ ...valid(), recipe: { ...valid().recipe, ...recipe } });
  assertEquals(rejection({ target_language: 'en' }), error400('Missing "recipe.title" in request body'));
  assertEquals(rejection(withRecipe({ title: '   ' })), error400('Missing "recipe.title" in request body'));
  assertEquals(rejection(withRecipe({ title: 'x'.repeat(201) })), error400('Recipe title must be 200 characters or fewer'));
  assertEquals(rejection(withRecipe({ ingredients: undefined })), error400('Recipe may include at most 60 ingredients'));
  assertEquals(
    rejection(withRecipe({ ingredients: Array(61).fill({ name: 'a', quantity: 1 }) })),
    error400('Recipe may include at most 60 ingredients'),
  );
  assertEquals(rejection(withRecipe({ instructions: 'x' })), error400('Recipe may include at most 50 instructions'));
  assertEquals(
    rejection(withRecipe({ instructions: Array(51).fill({ step: 1, text: 'a' }) })),
    error400('Recipe may include at most 50 instructions'),
  );

  const badIngredient = error400('Recipe contains an invalid ingredient');
  for (const ingredient of [
    { name: '', quantity: 1 },
    { name: 'x'.repeat(161), quantity: 1 },
    { name: 'a', quantity: 1, unit: 5 },
    { name: 'a', quantity: 1, unit: 'u'.repeat(41) },
    { name: 'a', quantity: 'lots' },
    { name: 'a', quantity: -1 },
    { name: 'a', quantity: 1_000_001 },
    null,
  ]) {
    assertEquals(rejection(withRecipe({ ingredients: [ingredient] })), badIngredient, JSON.stringify(ingredient));
  }

  const badInstruction = error400('Recipe contains an invalid instruction');
  for (const instruction of [
    { step: 0, text: 'a' },
    { step: 1.5, text: 'a' },
    { step: '1', text: 'a' },
    { step: 1, text: ' ' },
    { step: 1, text: 'x'.repeat(1001) },
  ]) {
    assertEquals(rejection(withRecipe({ instructions: [instruction] })), badInstruction, JSON.stringify(instruction));
  }

  assertEquals(
    rejection(withRecipe({ ingredients: [], instructions: [] })),
    error400('Recipe must include ingredients or instructions to translate'),
  );
});

Deno.test('a body that is not an object throws a TypeError (a 500), as the old code did', () => {
  assertThrows(() => parseTranslateRequest(null), TypeError);
});
