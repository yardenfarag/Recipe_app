import { assertEquals, assertThrows } from 'jsr:@std/assert@1';

import { HttpError } from '../core/httpError.ts';
import { parseTransformRequest } from './transformRequest.ts';

const RECIPE_ID = '0b9a4b6e-3f7c-4f1e-9a51-2a8d6c1e7f30';

const valid = () => ({
  variant: ' vegan ',
  recipe: {
    id: ` ${RECIPE_ID} `,
    original_url: ' https://example.com/soup ',
    title: '  Tomato soup ',
    servings: 4,
    ingredients: [{ name: ' tomato ', quantity: 3, unit: ' pcs ' }],
    instructions: [{ step: 1, text: ' Chop. ' }],
    calories: 320,
  },
});

/** The exact 400 body a request gets. */
function rejection(body: unknown): [number, string] {
  try {
    parseTransformRequest(body);
  } catch (err) {
    if (err instanceof HttpError) return [err.status, JSON.stringify(err.body)];
    throw err;
  }
  throw new Error('expected a rejection');
}

const error400 = (message: string): [number, string] => [400, JSON.stringify({ error: message })];

Deno.test('a valid request is trimmed and normalised as before', () => {
  assertEquals(parseTransformRequest(valid()), {
    instruction: undefined,
    variant: 'vegan',
    kitchenAutoApply: false,
    title: 'Tomato soup',
    servings: 4,
    ingredients: [{ name: 'tomato', quantity: 3, unit: 'pcs' }],
    instructions: [{ step: 1, text: 'Chop.' }],
    calories: 320,
    recipeId: RECIPE_ID,
    sourceUrl: 'https://example.com/soup',
  });
});

Deno.test('instruction, kitchen flag, servings and recipe identity', () => {
  const parsed = parseTransformRequest({
    ...valid(),
    variant: 'not-a-variant',
    instruction: `  ${'x'.repeat(500)}`,
    kitchen_auto_apply: true,
    recipe_id: 'not-a-uuid',
    original_url: ' https://example.com/top ',
    recipe: { ...valid().recipe, servings: undefined, id: undefined },
  });
  assertEquals(parsed.instruction, 'x'.repeat(400));
  assertEquals(parsed.variant, undefined);
  assertEquals(parsed.kitchenAutoApply, true);
  assertEquals(parsed.servings, 1);
  assertEquals(parsed.recipeId, null);
  assertEquals(parsed.sourceUrl, 'https://example.com/top');
  assertEquals(parseTransformRequest({ ...valid(), kitchen_auto_apply: 'yes' }).kitchenAutoApply, false);
});

Deno.test('every bad request keeps its old { error } body', () => {
  const missingGoal = error400('Missing "variant" or "instruction" in request body');
  assertEquals(rejection({ ...valid(), variant: undefined }), missingGoal);
  assertEquals(rejection({ ...valid(), variant: 'spicy', instruction: '   ' }), missingGoal);

  const withRecipe = (recipe: Record<string, unknown>) => ({ ...valid(), recipe: { ...valid().recipe, ...recipe } });
  assertEquals(rejection({ variant: 'vegan' }), error400('Missing "recipe.title" in request body'));
  assertEquals(rejection(withRecipe({ title: '   ' })), error400('Missing "recipe.title" in request body'));
  assertEquals(rejection(withRecipe({ title: 'x'.repeat(201) })), error400('Recipe title must be 200 characters or fewer'));
  assertEquals(rejection(withRecipe({ ingredients: undefined })), error400('Recipe may include at most 60 ingredients'));
  assertEquals(
    rejection(withRecipe({ ingredients: Array(61).fill({ name: 'a', quantity: 1, unit: 'g' }) })),
    error400('Recipe may include at most 60 ingredients'),
  );
  assertEquals(rejection(withRecipe({ instructions: 'x' })), error400('Recipe may include at most 50 instructions'));
  assertEquals(
    rejection(withRecipe({ instructions: Array(51).fill({ step: 1, text: 'a' }) })),
    error400('Recipe may include at most 50 instructions'),
  );

  const badIngredient = error400('Recipe contains an invalid ingredient');
  for (const ingredient of [
    { name: '', quantity: 1, unit: 'g' },
    { name: 'x'.repeat(161), quantity: 1, unit: 'g' },
    { name: 'a', quantity: 1 },
    { name: 'a', quantity: 1, unit: ' ' },
    { name: 'a', quantity: 1, unit: 'u'.repeat(41) },
    { name: 'a', quantity: '1', unit: 'g' },
    { name: 'a', quantity: -1, unit: 'g' },
    { name: 'a', quantity: 1_000_001, unit: 'g' },
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

  const badServings = error400('Recipe servings must be between 1 and 1000');
  for (const servings of [0, 1.5, 1001, '4']) {
    assertEquals(rejection(withRecipe({ servings })), badServings, String(servings));
  }
  const badCalories = error400('Recipe calories are invalid');
  for (const calories of [-1, 10_000_001, '300']) {
    assertEquals(rejection(withRecipe({ calories })), badCalories, String(calories));
  }

  assertEquals(rejection(withRecipe({ ingredients: [] })), error400('Recipe must include at least one ingredient'));
});

Deno.test('a body that is not an object, or a non-string goal, throws a TypeError (a 500), as the old code did', () => {
  assertThrows(() => parseTransformRequest(null), TypeError);
  assertThrows(() => parseTransformRequest({ ...valid(), variant: 5 }), TypeError);
  assertThrows(() => parseTransformRequest({ ...valid(), instruction: 5 }), TypeError);
});
