import { assertEquals } from 'jsr:@std/assert@1';

import { parseSaveRecipeEditRequest } from './recipeEditTypes.ts';

/** The photo a write request parses to, or null when the request is refused. */
function photoOf(photo: unknown) {
  const request = parseSaveRecipeEditRequest({
    mode: 'write',
    app_language: 'en',
    locked_fields: [],
    content: { title: 'Soup', photo, servings: 2, ingredients: [], instructions: [] },
  });
  return request && request.mode !== 'retry' ? request.content.photo : null;
}

Deno.test('the photo actions a save can ask for', () => {
  assertEquals(photoOf({ action: 'generate' }), { action: 'generate' });
  assertEquals(photoOf({ action: 'remove' }), { action: 'remove' });
  assertEquals(photoOf({ action: 'replace', base64: 'AAAA' }), { action: 'replace', base64: 'AAAA', mime_type: 'image/jpeg' });
  // Older builds send keep, or no photo at all.
  assertEquals(photoOf({ action: 'keep' }), { action: 'keep' });
  assertEquals(photoOf(undefined), { action: 'keep' });
  // Anything else isn't a request.
  assertEquals(photoOf({ action: 'draw' }), null);
});
