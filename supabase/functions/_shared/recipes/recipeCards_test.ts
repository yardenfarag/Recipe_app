// npx deno test -A --no-lock supabase/functions/_shared/recipeCards_test.ts

import { assertEquals } from 'jsr:@std/assert@1';

import { hubCardToExtractRecipe } from './recipeCards.ts';

const card = {
  title: 'Blender soup',
  platform: 'web',
  instructions: [
    { step: 1, text: 'Simmer the tomatoes.' },
    { step: 2, text: 'Blend until smooth.' },
  ],
};

Deno.test('hub cache hits return the card appliances, cleaned against its steps', () => {
  const recipe = hubCardToExtractRecipe({
    ...card,
    appliances: [
      { key: 'blender', required: true, steps: [2], origin: 'source' },
      { key: 'oven', required: true, steps: [7], origin: 'source' },
      { key: 'not_a_key', required: true, steps: [1], origin: 'source' },
    ],
  });
  assertEquals(recipe.appliances, [{ key: 'blender', required: true, steps: [2], origin: 'source' }]);
});

Deno.test('a hub card from before PIN-26 stays not analysed', () => {
  assertEquals(hubCardToExtractRecipe(card).appliances, null);
  assertEquals(hubCardToExtractRecipe({ ...card, appliances: null }).appliances, null);
});

Deno.test('a hub card analysed as needing nothing keeps the empty list', () => {
  assertEquals(hubCardToExtractRecipe({ ...card, appliances: [] }).appliances, []);
});
