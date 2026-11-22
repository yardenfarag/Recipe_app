// npx deno test -A --no-lock supabase/functions/_shared/recipeCards_test.ts

import { assertEquals } from 'jsr:@std/assert@1';

import { findRecipeCard, hubCardToExtractRecipe, isHubPlatform, publishRecipeCard } from './recipeCards.ts';

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

Deno.test('hub cache hits return the card nutrition only next to its calories (PIN-80)', () => {
  const nutrition = { protein_g: 40, carbs_g: 120, fat_g: 30 };
  assertEquals(hubCardToExtractRecipe({ ...card, calories: 900, nutrition }).nutrition, nutrition);
  assertEquals(hubCardToExtractRecipe({ ...card, calories: null, nutrition }).nutrition, null);
  assertEquals(hubCardToExtractRecipe({ ...card, calories: 900, nutrition: { protein_g: 'x' } }).nutrition, null);
  assertEquals(hubCardToExtractRecipe({ ...card, calories: 900 }).nutrition, null);
});

Deno.test('Pinterest recipes stay out of the Hub (ADR 029); Facebook ones may go in', async () => {
  assertEquals(isHubPlatform('pinterest'), false);
  assertEquals(isHubPlatform('facebook'), true);
  // Neither call may touch the database for them: the admin client here would throw.
  const admin = new Proxy({}, { get: () => { throw new Error('database touched'); } }) as never;
  assertEquals(
    await findRecipeCard(admin, 'pinterest', 'https://www.pinterest.com/pin/452611831329517145/', '452611831329517145'),
    null,
  );
  assertEquals(
    await publishRecipeCard(
      admin,
      {
        title: 'Tortellini soup',
        platform: 'pinterest',
        original_url: 'https://www.pinterest.com/pin/452611831329517145/',
        ingredients: [{ name: 'tortellini', quantity: 14, unit: 'oz' }],
        instructions: [{ step: 1, text: 'Simmer.' }],
        servings: 6,
        extraction_status: 'full',
      } as never,
      '452611831329517145',
    ),
    { status: 'skipped', reason: 'platform' },
  );
});

Deno.test('a hub cache hit says whether its picture was drawn, so the saved copy is marked too', () => {
  const drawn = { ...card, image_url: 'https://x/ai/a.jpg', image_generated: true };
  assertEquals(hubCardToExtractRecipe(drawn).image_generated, true);
  assertEquals(hubCardToExtractRecipe({ ...card, image_url: 'https://x/web/a.jpg' }).image_generated, false);
  // No picture, nothing to mark.
  assertEquals(hubCardToExtractRecipe({ ...card, image_url: null, image_generated: true }).image_generated, false);
});
