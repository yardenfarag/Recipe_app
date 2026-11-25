import { assertEquals, assertThrows } from 'jsr:@std/assert@1';

import { HttpError } from '../core/httpError.ts';
import { parseSubstitutionRequest } from './substitutionRequest.ts';

const ingredient = { name: ' Butter ', quantity: 50, unit: ' g ' };
const alternative = { name: 'Olive oil', quantity: '40', unit: 'ml', reason: 'x' };

/** The exact 400 body a request gets. */
function rejection(body: unknown): [number, string] {
  try {
    parseSubstitutionRequest(body);
  } catch (err) {
    if (err instanceof HttpError) return [err.status, JSON.stringify(err.body)];
    throw err;
  }
  throw new Error('expected a rejection');
}

const bad = (error: string): [number, string] => [400, JSON.stringify({ error })];

Deno.test('substitutionRequest: suggest is the default mode, trimmed, with a known language', () => {
  assertEquals(
    parseSubstitutionRequest({
      ingredient,
      recipe_title: ' Cake ',
      other_ingredients: [' flour ', 'sugar'],
      language: ' HE ',
    }),
    {
      mode: 'suggest',
      ingredient: { name: 'Butter', quantity: 50, unit: 'g' },
      recipeTitle: 'Cake',
      otherIngredients: ['flour', 'sugar'],
      language: 'he',
    },
  );
  const plain = parseSubstitutionRequest({ mode: '  ', ingredient, recipe_title: 'Cake', language: 'xx' });
  assertEquals(plain.mode, 'suggest');
  assertEquals(plain.language, null);
  if (plain.mode === 'suggest') assertEquals(plain.otherIngredients, []);
});

Deno.test('substitutionRequest: an unknown mode is the old 400', () => {
  assertEquals(rejection({ mode: 'other', ingredient }), bad('Unsupported mode'));
});

Deno.test('substitutionRequest: suggest checks run in the old order with the old texts', () => {
  assertEquals(rejection({ recipe_title: 'Cake' }), bad('Missing or invalid "ingredient" in request body'));
  assertEquals(rejection({ ingredient: { name: 'x' } }), bad('Missing or invalid "ingredient" in request body'));
  assertEquals(
    rejection({ ingredient: { name: 'x', quantity: -1 }, recipe_title: '' }),
    bad('Invalid "ingredient" in request body'),
  );
  assertEquals(rejection({ ingredient, recipe_title: '  ' }), bad('Missing "recipe_title" in request body'));
  assertEquals(
    rejection({ ingredient, recipe_title: 'x'.repeat(201) }),
    bad('Recipe title must be 200 characters or fewer'),
  );
  const tooMany = bad('Other ingredients must contain at most 60 short names');
  assertEquals(rejection({ ingredient, recipe_title: 'Cake', other_ingredients: 'flour' }), tooMany);
  assertEquals(rejection({ ingredient, recipe_title: 'Cake', other_ingredients: [' '] }), tooMany);
  assertEquals(rejection({ ingredient, recipe_title: 'Cake', other_ingredients: Array(61).fill('a') }), tooMany);
});

Deno.test('substitutionRequest: rewrite reads both ingredients, the steps and an optional title', () => {
  assertEquals(
    parseSubstitutionRequest({
      mode: ' rewrite_instructions ',
      ingredient,
      alternative,
      instructions: [{ step: 1.4, text: ' Melt the butter. ' }],
      recipe_title: '  ',
      language: 'fr',
    }),
    {
      mode: 'rewrite_instructions',
      ingredient: { name: 'Butter', quantity: 50, unit: 'g' },
      alternative: { name: 'Olive oil', quantity: 40, unit: 'ml' },
      instructions: [{ step: 1, text: 'Melt the butter.' }],
      recipeTitle: undefined,
      language: 'fr',
    },
  );
});

Deno.test('substitutionRequest: rewrite checks run in the old order with the old texts', () => {
  const mode = 'rewrite_instructions';
  assertEquals(rejection({ mode, alternative }), bad('Missing or invalid "ingredient" in request body'));
  assertEquals(rejection({ mode, ingredient }), bad('Missing or invalid "alternative" in request body'));
  assertEquals(rejection({ mode, ingredient, alternative }), bad('Missing "instructions" in request body'));
  assertEquals(
    rejection({ mode, ingredient, alternative, instructions: Array(81).fill({ step: 1, text: 'a' }) }),
    bad('Instructions must be an array of at most 80 steps'),
  );
  assertEquals(
    rejection({ mode, ingredient, alternative, instructions: [{ step: 0, text: 'a' }] }),
    bad('Invalid "instructions" in request body'),
  );
  assertEquals(
    rejection({ mode, ingredient, alternative, instructions: [], recipe_title: 'x'.repeat(201) }),
    bad('Recipe title must be 200 characters or fewer'),
  );
});

Deno.test('substitutionRequest: with no steps a language of the wrong type is never read', () => {
  const parsed = parseSubstitutionRequest({
    mode: 'rewrite_instructions',
    ingredient,
    alternative,
    instructions: [],
    language: 5,
  });
  assertEquals(parsed.language, null);
});

Deno.test('substitutionRequest: a body or field of the wrong type throws a TypeError (a 500), as before', () => {
  assertThrows(() => parseSubstitutionRequest(null), TypeError);
  assertThrows(() => parseSubstitutionRequest({ mode: 5 }), TypeError);
  assertThrows(() => parseSubstitutionRequest({ ingredient, recipe_title: 5 }), TypeError);
  assertThrows(() => parseSubstitutionRequest({ ingredient, recipe_title: 'Cake', language: 5 }), TypeError);
  assertThrows(
    () =>
      parseSubstitutionRequest({
        mode: 'rewrite_instructions',
        ingredient,
        alternative,
        instructions: [{ step: 1, text: 'a' }],
        language: 5,
      }),
    TypeError,
  );
});
