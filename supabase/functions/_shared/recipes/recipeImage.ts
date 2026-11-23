/**
 * An AI picture for a recipe that has no photo: a Hub card whose site blocked the image download,
 * or a recipe written by hand without one. Always the same illustrated style, so it reads as a
 * drawing and not as a photo of the dish, and the apps mark it "AI image" (image_generated).
 *
 * The picture is stored in recipe-thumbnails under ai/, named by a hash of its bytes like the web
 * thumbnails in persistThumbnail.ts, and served from there.
 */

import { decode as decodePng } from 'npm:fast-png@6.3.0';
import jpeg from 'npm:jpeg-js@0.4.4';

import type { Db } from '../core/supabaseAdmin.ts';
import { generateImage, type GenerateImageOptions } from '../llm/imageClient.ts';
import type { LlmUsageSnapshot } from '../llm/pricing.ts';

const BUCKET = 'recipe-thumbnails';
const MAX_INGREDIENTS = 8;
const JPEG_QUALITY = 82;

export interface RecipeImageInput {
  title: string;
  ingredients: unknown;
}

export type DrawRecipeImageResult =
  | { ok: true; url: string; usage: LlmUsageSnapshot; model: string; bytes: number; ms: number }
  | { ok: false; error: string; usage: LlmUsageSnapshot | null; ms: number };

export interface DrawRecipeImageOptions {
  /** Tests pass their own. */
  generate?: (options: GenerateImageOptions) => ReturnType<typeof generateImage>;
  /** Per model tried; the image client's own default when left out. */
  timeoutMs?: number;
}

/** One line of plain text: no quotes or line breaks for the title to escape the prompt with. */
function clean(value: string, max: number): string {
  return value.replace(/["“”\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function ingredientNames(ingredients: unknown): string[] {
  if (!Array.isArray(ingredients)) return [];
  return ingredients
    .map((item) => (item && typeof item === 'object' ? (item as { name?: unknown }).name : item))
    .filter((name): name is string => typeof name === 'string')
    .map((name) => clean(name, 40))
    .filter(Boolean)
    .slice(0, MAX_INGREDIENTS);
}

/** The house style from the bake-off: a flat gouache drawing on cream, the dish only. */
export function recipeImagePrompt(recipe: RecipeImageInput): string | null {
  const title = clean(recipe.title ?? '', 120);
  if (!title) return null;
  const names = ingredientNames(recipe.ingredients);
  const ingredients = names.length ? ` (main ingredients: ${names.join(', ')})` : '';
  return (
    `Flat gouache illustration of the finished dish "${title}"${ingredients}, seen from a 3/4 angle, ` +
    `centred on a plain soft cream background. Simple bold shapes, visible brush texture, warm limited palette, ` +
    `like a modern cookbook illustration. Just the dish in its plate or bowl, nothing else. ` +
    `No people, no hands, no text, no lettering, no logos, no border.`
  );
}

/**
 * A JPEG for the stored copy. Qwen answers with a ~1.4 MB PNG; as a JPEG it is ~150 KB, and the
 * conversion takes about 0.1 s. A JPEG or WebP is kept as it is. Null for anything else.
 */
export function toStoredImage(bytes: Uint8Array, mediaType: string): { bytes: Uint8Array; type: string; ext: string } | null {
  if (mediaType === 'image/jpeg') return { bytes, type: 'image/jpeg', ext: 'jpg' };
  if (mediaType === 'image/webp') return { bytes, type: 'image/webp', ext: 'webp' };
  if (mediaType !== 'image/png') return null;
  try {
    const png = decodePng(bytes);
    const rgba = toRgba(png);
    if (!rgba) return { bytes, type: 'image/png', ext: 'png' };
    const encoded = jpeg.encode({ data: rgba, width: png.width, height: png.height }, JPEG_QUALITY);
    return { bytes: new Uint8Array(encoded.data), type: 'image/jpeg', ext: 'jpg' };
  } catch (err) {
    console.warn('[recipeImage] png conversion failed, storing the png', err);
    return { bytes, type: 'image/png', ext: 'png' };
  }
}

/** 8-bit RGB, RGBA, grey or grey+alpha as RGBA. Null for what jpeg-js can't take directly (16-bit, palette). */
export function toRgba(png:{ width: number; height: number; channels: number; depth: number; data: ArrayLike<number>; palette?: unknown }): Uint8Array | null {
  if (png.depth !== 8 || png.palette) return null;
  const { channels, data } = png;
  const pixels = png.width * png.height;
  if (channels === 4) return data instanceof Uint8Array ? data : Uint8Array.from(data);
  if (![1, 2, 3].includes(channels)) return null;
  const out = new Uint8Array(pixels * 4);
  for (let p = 0; p < pixels; p++) {
    const i = p * channels;
    const o = p * 4;
    if (channels === 3) {
      out[o] = data[i];
      out[o + 1] = data[i + 1];
      out[o + 2] = data[i + 2];
    } else {
      out[o] = out[o + 1] = out[o + 2] = data[i];
    }
    out[o + 3] = 255;
  }
  return out;
}

async function sha256Hex(bytes: Uint8Array, length: number): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, length);
}

/** Draws, converts and stores a picture for the recipe. Never throws. */
export async function drawRecipeImage(
  admin: Db,
  recipe: RecipeImageInput,
  options: DrawRecipeImageOptions = {},
): Promise<DrawRecipeImageResult> {
  const started = Date.now();
  const prompt = recipeImagePrompt(recipe);
  if (!prompt) return { ok: false, error: 'no title', usage: null, ms: 0 };

  const result = await (options.generate ?? generateImage)({
    kind: 'recipe_image',
    prompt,
    ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
  });
  if (!result.ok) {
    return { ok: false, error: result.error, usage: null, ms: Date.now() - started };
  }
  const { image } = result;
  const usage: LlmUsageSnapshot = {
    model: image.model,
    kind: 'recipe_image',
    promptTokenCount: 0,
    candidatesTokenCount: 0,
    thoughtsTokenCount: 0,
    totalTokenCount: 0,
    ...(image.costUsd != null ? { costUsd: image.costUsd } : {}),
  };

  const stored = toStoredImage(image.bytes, image.mediaType);
  if (!stored) return { ok: false, error: `unexpected image type ${image.mediaType}`, usage, ms: Date.now() - started };

  const path = `ai/${await sha256Hex(stored.bytes, 32)}.${stored.ext}`;
  const { error } = await admin.storage.from(BUCKET).upload(path, stored.bytes, {
    contentType: stored.type,
    cacheControl: '31536000',
    upsert: true,
  });
  if (error) {
    console.error('[recipeImage] upload failed', { path, message: error.message });
    return { ok: false, error: `upload failed: ${error.message}`, usage, ms: Date.now() - started };
  }
  const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
  console.log('[recipeImage] ok', { model: image.model, path, bytes: stored.bytes.length, ms: Date.now() - started });
  return { ok: true, url: data.publicUrl, usage, model: image.model, bytes: stored.bytes.length, ms: Date.now() - started };
}
