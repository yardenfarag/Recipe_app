// npx deno test -A --no-lock supabase/functions/_shared/recipes/recipeImage_test.ts
//
// The drawn picture for a recipe without a photo: the prompt, the JPEG copy, and where it's stored.

import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { encode as encodePng } from 'npm:fast-png@6.3.0';

import type { Db } from '../core/supabaseAdmin.ts';
import type { GenerateImageResult } from '../llm/imageClient.ts';
import { drawRecipeImage, recipeImagePrompt, toStoredImage } from './recipeImage.ts';

Deno.test('the prompt names the dish and its main ingredients, in the house style', () => {
  const prompt = recipeImagePrompt({
    title: 'Salmon "Steak"\nwith butter',
    ingredients: Array.from({ length: 12 }, (_, i) => ({ name: `ingredient ${i + 1}`, quantity: 1, unit: '' })),
  })!;
  assertStringIncludes(prompt, 'the finished dish "Salmon Steak with butter"');
  assertStringIncludes(prompt, 'ingredient 8)');
  assert(!prompt.includes('ingredient 9'), 'at most eight ingredients');
  assertStringIncludes(prompt, 'gouache illustration');
  assertStringIncludes(prompt, 'no text');
});

Deno.test('a recipe without a title gets no prompt, and odd ingredient lists are skipped', () => {
  assertEquals(recipeImagePrompt({ title: '  ', ingredients: [] }), null);
  const prompt = recipeImagePrompt({ title: 'עוגת וניל', ingredients: 'not a list' })!;
  assertStringIncludes(prompt, '"עוגת וניל",');
});

Deno.test('a PNG is stored as a much smaller JPEG; a JPEG is kept; anything else is refused', () => {
  const width = 64;
  const height = 48;
  const data = new Uint8Array(width * height * 3).map((_, i) => (i * 37) % 256);
  const png = encodePng({ width, height, data, channels: 3, depth: 8 });

  const stored = toStoredImage(png, 'image/png')!;
  assertEquals([stored.type, stored.ext], ['image/jpeg', 'jpg']);
  assertEquals([stored.bytes[0], stored.bytes[1]], [0xff, 0xd8]);

  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
  assertEquals(toStoredImage(jpeg, 'image/jpeg'), { bytes: jpeg, type: 'image/jpeg', ext: 'jpg' });
  assertEquals(toStoredImage(new Uint8Array([1, 2, 3]), 'image/svg+xml'), null);
});

/** Records uploads and hands out public URLs like Supabase Storage. */
function fakeStorage(uploads: Array<{ path: string; type: string }>, failUpload = false): Db {
  return {
    storage: {
      from: () => ({
        upload: (path: string, _bytes: Uint8Array, options: { contentType: string }) => {
          uploads.push({ path, type: options.contentType });
          return Promise.resolve({ error: failUpload ? { message: 'bucket full' } : null });
        },
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://project.supabase.co/storage/v1/object/public/recipe-thumbnails/${path}` },
        }),
      }),
    },
  } as unknown as Db;
}

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const generated = (): Promise<GenerateImageResult> =>
  Promise.resolve({
    ok: true,
    attempts: [],
    image: { bytes: JPEG_BYTES, mediaType: 'image/jpeg', model: 'qwen/qwen-image-2.1-turbo', costUsd: 0.0184, durationMs: 9000 },
  });

Deno.test('a drawn picture is stored under ai/, named by its bytes, with its cost for the usage log', async () => {
  const uploads: Array<{ path: string; type: string }> = [];
  const result = await drawRecipeImage(fakeStorage(uploads), { title: 'Soup', ingredients: [] }, { generate: generated });
  assert(result.ok);
  assertEquals(uploads.length, 1);
  assert(/^ai\/[0-9a-f]{32}\.jpg$/.test(uploads[0].path), uploads[0].path);
  assertEquals(uploads[0].type, 'image/jpeg');
  assertEquals(result.url, `https://project.supabase.co/storage/v1/object/public/recipe-thumbnails/${uploads[0].path}`);
  assertEquals([result.usage.model, result.usage.kind, result.usage.costUsd], ['qwen/qwen-image-2.1-turbo', 'recipe_image', 0.0184]);
});

Deno.test('a failed drawing or upload is reported, never thrown', async () => {
  const failed = await drawRecipeImage(fakeStorage([]), { title: 'Soup', ingredients: [] }, {
    generate: () => Promise.resolve({ ok: false, error: 'HTTP 500', attempts: [] }),
  });
  assertEquals([failed.ok, failed.ok ? null : failed.error], [false, 'HTTP 500']);

  const upload = await drawRecipeImage(fakeStorage([], true), { title: 'Soup', ingredients: [] }, { generate: generated });
  assertEquals(upload.ok, false);
  // The picture was made, so its cost is still logged.
  assertEquals(upload.usage?.costUsd, 0.0184);

  const untitled = await drawRecipeImage(fakeStorage([]), { title: '', ingredients: [] }, {
    generate: () => {
      throw new Error('no call without a title');
    },
  });
  assertEquals(untitled.ok, false);
});
