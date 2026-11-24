import { assertEquals, assertMatch, assertNotEquals, assertThrows } from 'jsr:@std/assert@1';

import {
  generateToken,
  insertRowFromSnapshot,
  publicSnapshot,
  type RecipeSnapshot,
  snapshotFromRecipe,
} from './recipeShareSnapshot.ts';

const instructions = [{ step: 1, text: 'Chop.' }];

Deno.test('a token is 24 URL-safe characters and different every time', () => {
  const token = generateToken();
  assertMatch(token, /^[A-Za-z0-9_-]{24}$/);
  assertNotEquals(generateToken(), token);
});

Deno.test('a recipe without a title cannot be shared', () => {
  assertThrows(() => snapshotFromRecipe({ title: '   ' }), Error, 'Recipe is missing a title');
  assertThrows(() => snapshotFromRecipe({}), Error, 'Recipe is missing a title');
});

Deno.test('a bare row gets the same defaults as before', () => {
  assertEquals(snapshotFromRecipe({ title: ' Soup ', servings: 0 }), {
    title: 'Soup',
    original_url: null,
    platform: null,
    image_url: null,
    source_video_url: null,
    ingredients: [],
    instructions: [],
    servings: 1,
    calories: null,
    nutrition: null,
    estimated_time_minutes: null,
    cost_estimate: null,
    effort_level: null,
    extraction_status: 'full',
    extraction_source: null,
    tags: null,
    missing_fields: null,
    source_language: 'en',
    calories_reasoning: null,
    time_reasoning: null,
    appliances: null,
  });
});

Deno.test('macros are kept only next to calories', () => {
  const nutrition = { protein_g: 20.4, carbs_g: 10, fat_g: 5 };
  assertEquals(snapshotFromRecipe({ title: 'a', calories: 400, nutrition }).nutrition, {
    protein_g: 20,
    carbs_g: 10,
    fat_g: 5,
  });
  assertEquals(snapshotFromRecipe({ title: 'a', nutrition }).nutrition, null);
});

Deno.test('the public copy leaves empty fields out of the JSON', () => {
  const snapshot = snapshotFromRecipe({ title: 'Soup', instructions, appliances: [] });
  assertEquals(
    JSON.stringify(publicSnapshot(snapshot)),
    JSON.stringify({
      title: 'Soup',
      ingredients: [],
      instructions,
      servings: 1,
      nutrition: null,
      extraction_status: 'full',
      source_language: 'en',
      appliances: [],
    }),
  );
});

Deno.test('an old snapshot (no nutrition, no appliances) still reads', () => {
  const old = { title: 'Old', ingredients: [], instructions, servings: 2, calories: 300, extraction_status: 'full' };
  const out = publicSnapshot(old as RecipeSnapshot);
  assertEquals([out.calories, out.nutrition, out.appliances, out.source_language], [300, null, null, undefined]);
});

Deno.test('a claimed copy belongs to the claimer, with stored defaults', () => {
  const row = insertRowFromSnapshot('user-1', { title: 'Soup', servings: 2, extraction_status: '' } as RecipeSnapshot);
  assertEquals(row, {
    user_id: 'user-1',
    title: 'Soup',
    original_url: null,
    platform: null,
    image_url: null,
    source_video_url: null,
    ingredients: [],
    instructions: [],
    servings: 2,
    calories: null,
    nutrition: null,
    estimated_time_minutes: null,
    cost_estimate: null,
    effort_level: null,
    extraction_status: 'full',
    extraction_source: null,
    tags: [],
    missing_fields: null,
    source_language: 'en',
    calories_reasoning: null,
    time_reasoning: null,
    appliances: null,
    is_favorite: false,
    migrated_from_guest: false,
  });
});
