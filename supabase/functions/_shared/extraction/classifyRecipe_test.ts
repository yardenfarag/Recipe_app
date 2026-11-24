// npx deno test -A --no-lock supabase/functions/_shared/extraction/classifyRecipe_test.ts

import { assertEquals } from 'jsr:@std/assert@1';

import { keepDraftLists, recipeRepairIsUpgrade } from './classifyRecipe.ts';

const STEPS = [
  { step: 1, text: 'Season the steak generously.', timestamp_seconds: 12 },
  { step: 2, text: 'Sear in a hot pan for 3 minutes per side.', timestamp_seconds: 40 },
  { step: 3, text: 'Rest for 5 minutes and slice.' },
];
const INGREDIENTS = [{ name: 'ribeye steak', quantity: 1, unit: '' }];

// PIN-186: the app saves the repaired recipe over the old one.
Deno.test("keepDraftLists keeps the cook's steps when the model returns fewer", () => {
  const draft = { title: 'Steak', ingredients: [] as typeof INGREDIENTS, instructions: STEPS };
  const repaired = { title: 'Steak', ingredients: INGREDIENTS, instructions: [{ step: 1, text: 'Cook the steak.' }] };
  const kept = keepDraftLists(draft, repaired);
  assertEquals(kept, { title: 'Steak', ingredients: INGREDIENTS, instructions: STEPS });
  assertEquals(recipeRepairIsUpgrade({ ...draft, found_recipe: true }, { ...kept, found_recipe: true }), true);
});

Deno.test("keepDraftLists keeps the cook's ingredients and takes the new steps", () => {
  const draft = { ingredients: INGREDIENTS, instructions: [] as typeof STEPS };
  const repaired = { ingredients: [{ name: 'steak', quantity: 2, unit: '' }], instructions: STEPS };
  assertEquals(keepDraftLists(draft, repaired), { ingredients: INGREDIENTS, instructions: STEPS });
});

Deno.test('keepDraftLists leaves a list empty when the model found nothing for it', () => {
  const draft = { ingredients: INGREDIENTS, instructions: [] as typeof STEPS };
  const repaired = { ingredients: [] as typeof INGREDIENTS, instructions: [] as typeof STEPS };
  assertEquals(keepDraftLists(draft, repaired), { ingredients: INGREDIENTS, instructions: [] });
});
