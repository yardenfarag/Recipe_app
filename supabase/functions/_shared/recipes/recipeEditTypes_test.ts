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

/** The source a partial import's save parses to, or null when the request is refused. */
function importSourceOf(source: Record<string, unknown>) {
  const request = parseSaveRecipeEditRequest({
    mode: 'import',
    app_language: 'en',
    locked_fields: [],
    content: { title: 'Soup', servings: 2, ingredients: [], instructions: [] },
    source: { image_url: null, source_video_url: null, source_language: 'en', ...source },
  });
  return request?.mode === 'import' ? request.source : null;
}

Deno.test('a partial import keeps its link, and only a photo or a written text has none', () => {
  const link = { original_url: 'https://www.tiktok.com/@a/video/1', platform: 'tiktok', extraction_source: 'captions' };
  assertEquals(importSourceOf(link)?.original_url, link.original_url);
  assertEquals(importSourceOf({ ...link, original_url: null }), null);
  assertEquals(importSourceOf({ original_url: null, platform: 'photo', extraction_source: 'photo' })?.platform, 'photo');
});

Deno.test('a partial written text (ADR 032) saves as written, with no link', () => {
  assertEquals(importSourceOf({ original_url: null, platform: 'unknown', extraction_source: 'manual' }), {
    original_url: null,
    platform: 'unknown',
    extraction_source: 'manual',
    image_url: null,
    source_video_url: null,
    source_language: 'en',
  });
  // `manual` and `unknown` only come together, and never with a link.
  assertEquals(importSourceOf({ original_url: null, platform: 'tiktok', extraction_source: 'manual' }), null);
  assertEquals(importSourceOf({ original_url: null, platform: 'unknown', extraction_source: 'captions' }), null);
  assertEquals(
    importSourceOf({ original_url: 'https://example.com/soup', platform: 'unknown', extraction_source: 'manual' }),
    null,
  );
});
