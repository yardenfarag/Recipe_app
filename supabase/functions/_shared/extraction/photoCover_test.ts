// npx deno test -A --no-lock supabase/functions/_shared/extraction/photoCover_test.ts
//
// The cover of a Snapped photo: kept, cut down to the dish, or drawn.

import { assert, assertEquals } from 'jsr:@std/assert@1';
import { encode as encodePng } from 'npm:fast-png@6.3.0';
import jpeg from 'npm:jpeg-js@0.4.4';

import type { Db } from '../core/supabaseAdmin.ts';
import {
  cropImage,
  cropRect,
  drawTimeoutFor,
  parseBox,
  planPhotoCover,
  resolvePhotoCover,
  type PhotoCoverDeps,
} from './photoCover.ts';

/** A white screenshot-like image with a red "dish photo" from x 100-900, y 400-1000. */
function screenshot(): { width: number; height: number; data: Uint8Array } {
  const width = 1000;
  const height = 2000;
  const data = new Uint8Array(width * height * 4).fill(255);
  for (let y = 400; y < 1000; y++) {
    for (let x = 100; x < 900; x++) {
      const i = (y * width + x) * 4;
      data[i + 1] = 0;
      data[i + 2] = 0;
    }
  }
  return { width, height, data };
}

const asJpeg = () => new Uint8Array(jpeg.encode(screenshot(), 90).data);
const toBase64 = (bytes: Uint8Array) => btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''));
const DISH_BOX = { left: 0.1, top: 0.2, right: 0.9, bottom: 0.5 };

Deno.test('a box comes as fractions, or on the 0-1000 scale; anything else is no box', () => {
  assertEquals(parseBox([0.1, 0.2, 0.9, 0.5]), DISH_BOX);
  assertEquals(parseBox([100, 200, 900, 500]), DISH_BOX);
  assertEquals(parseBox([0.1, 0.2, 0.9]), null);
  assertEquals(parseBox([0.1, 0.2, 0.12, 0.5]), null, 'too narrow');
  assertEquals(parseBox([0.9, 0.2, 0.1, 0.5]), null, 'edges the wrong way round');
  assertEquals(parseBox([0.1, -0.2, 0.9, 0.5]), null);
  assertEquals(parseBox([100, 200, 1900, 500]), null);
  assertEquals(parseBox('0.1,0.2,0.9,0.5'), null);
});

Deno.test('the plan: a dish photo stays, a part of one is cut out, no dish is drawn', () => {
  assertEquals(planPhotoCover({ dish_photo: 'whole' }), { action: 'keep' });
  assertEquals(planPhotoCover({ dish_photo: 'none' }), { action: 'draw' });
  assertEquals(planPhotoCover({ dish_photo: 'part', dish_photo_box: [0.1, 0.2, 0.9, 0.5] }), { action: 'crop', box: DISH_BOX });
  // Unclear answers keep the photo, as before.
  assertEquals(planPhotoCover({}), { action: 'keep' });
  assertEquals(planPhotoCover({ dish_photo: 'part' }), { action: 'keep' });
  assertEquals(planPhotoCover({ dish_photo: 'part', dish_photo_box: [0, 0, 0.97, 0.95] }), { action: 'keep' }, 'nearly all of it');
});

Deno.test('the crop sits a little inside the box', () => {
  assertEquals(cropRect(DISH_BOX, 1000, 2000), { x: 116, y: 412, width: 768, height: 576 });
  assertEquals(cropRect({ left: 0, top: 0, right: 1, bottom: 1 }, 100, 100), { x: 2, y: 2, width: 96, height: 96 });
});

Deno.test('a JPEG is cut down to the dish, and comes back as a JPEG of only the dish', () => {
  const result = cropImage(asJpeg(), 'image/jpeg', DISH_BOX);
  assert(result.ok);
  assertEquals([result.width, result.height], [768, 576]);
  const decoded = jpeg.decode(result.bytes, { useTArray: true });
  assertEquals([decoded.width, decoded.height], [768, 576]);
  // Every corner is the red photo, none of the white page around it.
  for (const [x, y] of [[2, 2], [765, 2], [2, 573], [765, 573]]) {
    const i = (y * decoded.width + x) * 4;
    assert(decoded.data[i] > 200 && decoded.data[i + 1] < 60 && decoded.data[i + 2] < 60, `corner ${x},${y} is red`);
  }
});

Deno.test('a PNG is cut down too', () => {
  const image = screenshot();
  const png = encodePng({ width: image.width, height: image.height, data: image.data, channels: 4, depth: 8 });
  const result = cropImage(png, 'image/png', DISH_BOX);
  assert(result.ok);
  assertEquals([result.width, result.height], [768, 576]);
});

Deno.test('a dish photo too small for a cover, a format we cannot read, or a broken file is not cut', () => {
  assertEquals(cropImage(asJpeg(), 'image/jpeg', { left: 0.1, top: 0.2, right: 0.3, bottom: 0.5 }), { ok: false, reason: 'too_small' });
  assertEquals(cropImage(asJpeg(), 'image/webp', DISH_BOX), { ok: false, reason: 'unsupported' });
  assertEquals(cropImage(new Uint8Array([1, 2, 3, 4]), 'image/jpeg', DISH_BOX).ok, false);
});

Deno.test('a drawing gets up to 20 s a model, and none when under 8 s a model is left', () => {
  assertEquals(drawTimeoutFor(120_000), 20_000);
  assertEquals(drawTimeoutFor(30_000), 12_500);
  assertEquals(drawTimeoutFor(20_000), null);
});

const admin = {} as Db;
const base = {
  admin,
  imageBase64: toBase64(asJpeg()),
  mimeType: 'image/jpeg',
  userId: 'user-1',
  recipe: { title: 'Fried chicken', ingredients: [] },
  partial: false,
  msLeft: 60_000,
};

function fakes(overrides: Partial<PhotoCoverDeps> = {}) {
  const calls = { stored: 0, drawn: 0 };
  const deps: PhotoCoverDeps = {
    store: () => {
      calls.stored++;
      return Promise.resolve('https://x/photo/user-1/cover.jpg');
    },
    draw: () => {
      calls.drawn++;
      return Promise.resolve({
        ok: true,
        url: 'https://x/ai/drawn.jpg',
        model: 'qwen',
        bytes: 1,
        ms: 1,
        usage: { model: 'qwen', kind: 'recipe_image', promptTokenCount: 0, candidatesTokenCount: 0, thoughtsTokenCount: 0, totalTokenCount: 0 },
      });
    },
    ...overrides,
  };
  return { deps, calls };
}

Deno.test('a photo of the dish stays the cover', async () => {
  const { deps, calls } = fakes();
  const result = await resolvePhotoCover({ ...base, answer: { dish_photo: 'whole' } }, deps);
  assertEquals([result.imageUrl, result.generated, calls.stored, calls.drawn], [undefined, false, 0, 0]);
});

Deno.test('a screenshot with the dish in it gets the dish, cut out, as its cover', async () => {
  const { deps, calls } = fakes();
  const result = await resolvePhotoCover({ ...base, answer: { dish_photo: 'part', dish_photo_box: [0.1, 0.2, 0.9, 0.5] } }, deps);
  assertEquals([result.imageUrl, result.generated, calls.stored, calls.drawn], ['https://x/photo/user-1/cover.jpg', false, 1, 0]);
  assertEquals(result.metadata.cover, 'cropped');
});

Deno.test('no dish in the photo, or one too small to show: a drawing, marked as one', async () => {
  for (const answer of [{ dish_photo: 'none' }, { dish_photo: 'part', dish_photo_box: [0.1, 0.2, 0.3, 0.5] }]) {
    const { deps, calls } = fakes();
    const result = await resolvePhotoCover({ ...base, answer }, deps);
    assertEquals([result.imageUrl, result.generated, calls.drawn], ['https://x/ai/drawn.jpg', true, 1]);
    assertEquals(result.usage?.kind, 'recipe_image');
  }
});

Deno.test('a partial import is left without a cover: the editor draws one when it is saved', async () => {
  const { deps, calls } = fakes();
  const result = await resolvePhotoCover({ ...base, partial: true, answer: { dish_photo: 'none' } }, deps);
  assertEquals([result.imageUrl, result.generated, calls.drawn], [null, false, 0]);
});

Deno.test('the photo stays when there is no time to draw, the drawing fails, or the upload fails', async () => {
  const late = fakes();
  const noTime = await resolvePhotoCover({ ...base, msLeft: 10_000, answer: { dish_photo: 'none' } }, late.deps);
  assertEquals([noTime.imageUrl, late.calls.drawn, noTime.metadata.cover_reason], [undefined, 0, 'no_time_to_draw']);

  const failing = fakes({ draw: () => Promise.resolve({ ok: false, error: 'boom', usage: null, ms: 1 }) });
  const failed = await resolvePhotoCover({ ...base, answer: { dish_photo: 'none' } }, failing.deps);
  assertEquals([failed.imageUrl, failed.generated, failed.metadata.cover_reason], [undefined, false, 'draw_failed']);

  const noUpload = fakes({ store: () => Promise.resolve(undefined) });
  const notStored = await resolvePhotoCover({ ...base, answer: { dish_photo: 'part', dish_photo_box: [0.1, 0.2, 0.9, 0.5] } }, noUpload.deps);
  assertEquals([notStored.imageUrl, notStored.metadata.cover_reason], [undefined, 'upload_failed']);
});
