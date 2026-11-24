import { assertEquals } from 'jsr:@std/assert@1';

import type { LlmRecipe } from './recipeExtraction.ts';
import { buildExtraText, repairedRecipe, toLlmRecipe } from './recipeRepair.ts';
import { repairSealContext } from './recipeRepairCredit.ts';

const draft = () => ({
  title: '  Tomato soup ',
  servings: 4,
  ingredients: [{ name: ' tomato ', quantity: 3, unit: ' pcs ' }],
  instructions: [] as { step?: number; text?: string }[],
});

Deno.test('toLlmRecipe trims the draft and fills defaults', () => {
  const recipe = toLlmRecipe({
    ...draft(),
    servings: 2.5,
    ingredients: [
      { name: ' tomato ', quantity: 3, unit: ' pcs ' },
      { name: '  ', quantity: 1, unit: 'g' },
      { name: 'salt', quantity: Number.NaN },
    ],
    instructions: [{ text: ' Chop. ' }, { step: 7, text: 'Simmer.' }, { step: 1.5, text: 'Serve.' }, { text: ' ' }],
    cost_estimate: '$$$$',
    effort_level: 'Easy',
    tags: ['soup', 5 as unknown as string],
  });
  assertEquals(recipe?.title, 'Tomato soup');
  assertEquals(recipe?.servings, 1);
  assertEquals(recipe?.source_language, 'en');
  assertEquals(
    recipe?.ingredients.map(({ name, quantity, unit }) => ({ name, quantity, unit })),
    [
      { name: 'tomato', quantity: 3, unit: 'pcs' },
      { name: 'salt', quantity: 0, unit: '' },
    ],
  );
  assertEquals(recipe?.instructions.map(({ step, text }) => ({ step, text })), [
    { step: 1, text: 'Chop.' },
    { step: 7, text: 'Simmer.' },
    { step: 3, text: 'Serve.' },
  ]);
  assertEquals(recipe?.cost_estimate, undefined);
  assertEquals(recipe?.effort_level, 'Easy');
  assertEquals(recipe?.tags, ['soup']);
});

Deno.test('toLlmRecipe refuses a missing title, missing lists and lists over the limits', () => {
  assertEquals(toLlmRecipe(undefined), null);
  assertEquals(toLlmRecipe({ ...draft(), title: '   ' }), null);
  assertEquals(toLlmRecipe({ ...draft(), title: 'x'.repeat(201) }), null);
  assertEquals(toLlmRecipe({ ...draft(), title: ` ${'x'.repeat(200)} ` })?.title.length, 200);
  assertEquals(toLlmRecipe({ ...draft(), ingredients: undefined }), null);
  assertEquals(toLlmRecipe({ ...draft(), instructions: undefined }), null);
  assertEquals(toLlmRecipe({ ...draft(), ingredients: Array(61).fill({ name: 'a' }) }), null);
  assertEquals(toLlmRecipe({ ...draft(), instructions: Array(51).fill({ text: 'a' }) }), null);
});

Deno.test('buildExtraText joins the description, captions and the first 12 comments', () => {
  const comments = Array.from({ length: 14 }, (_, i) => ({ text: `c${i}`, isCreator: i === 0 }));
  const text = buildExtraText({ description: ' Desc ', captions: '  ', topComments: comments });
  const parts = text.split('\n\n');
  assertEquals(parts[0], 'Desc');
  assertEquals(parts[1], "(from the video's creator) c0");
  assertEquals(parts.length, 13);
  assertEquals(parts[12], 'c11');
  assertEquals(buildExtraText({ topComments: [] }), '');
});

Deno.test('repairedRecipe takes the repair, falls back to the draft and normalizes the language', () => {
  const current = toLlmRecipe({
    ...draft(),
    estimated_time_minutes: 30,
    cost_estimate: '$',
    tags: ['Soup'],
  }) as LlmRecipe;
  const after: LlmRecipe = {
    ...current,
    source_language: 'he-IL',
    servings: 0,
    instructions: [{ step: 1, text: 'Chop.' }],
    estimated_time_minutes: undefined,
    effort_level: 'Medium',
    tags: [],
    calories_reasoning: '  ',
  };
  const recipe = repairedRecipe(current, after, { status: 'full', missingFields: ['calories'] }, null);
  assertEquals(recipe.source_language, 'he');
  assertEquals(recipe.servings, 4);
  assertEquals(recipe.estimated_time_minutes, 30);
  assertEquals(recipe.cost_estimate, '$');
  assertEquals(recipe.effort_level, 'Medium');
  assertEquals(recipe.tags, ['soup']);
  assertEquals(recipe.calories_reasoning, null);
  assertEquals(recipe.extraction_status, 'full');
  assertEquals(recipe.missing_fields, ['calories']);
  assertEquals(recipe.appliances, null);
  const english = repairedRecipe(current, { ...after, source_language: 'english' }, { status: 'full', missingFields: [] }, null);
  assertEquals(english.source_language, 'en');
});

Deno.test('the sealed recipe is bound to the user and the reservation', () => {
  assertEquals(repairSealContext('user-1', 'res-1'), 'repair:user-1:res-1');
});
