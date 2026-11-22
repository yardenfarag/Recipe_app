/**
 * The cover picture of a recipe Snapped from a photo.
 *
 * Until 2026-11-22 the uploaded photo was always the cover, whatever it was. A screenshot of an
 * image search or a post then carried that app's own title, buttons and icons into the Library,
 * right under the recipe's name. Now the photo model says where the dish is in the image
 * (gemini.ts, dish_photo), and:
 *
 * - "whole": the photo is the dish. It stays the cover, as before.
 * - "part": a photo of the dish is part of the image. The cover is that part, cut out.
 * - "none": no dish to show (a handwritten card, a page of text). The cover is a drawn picture,
 *   marked "AI image" (recipeImage.ts).
 *
 * Anything unclear (no answer, a box that makes no sense, a format we can't decode) keeps the
 * photo, as before. The uploaded photo itself is always kept in Storage (keepUploadedPhoto).
 */

import { decode as decodePng } from 'npm:fast-png@6.3.0';
import jpeg from 'npm:jpeg-js@0.4.4';

import type { Db } from '../core/supabaseAdmin.ts';
import type { GeminiUsageSnapshot } from '../llm/pricing.ts';
import { drawRecipeImage, type DrawRecipeImageResult, type RecipeImageInput, toRgba } from '../recipes/recipeImage.ts';
import type { DishPhotoAnswer } from './gemini.ts';
import { decodeBase64, persistUserPhotoBytes } from './persistThumbnail.ts';

/** Fractions of the image's width and height. */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export type CoverPlan = { action: 'keep' } | { action: 'crop'; box: Box } | { action: 'draw' };

/** A box covering this much of the image is the whole image; cropping it changes nothing worth a new file. */
const WHOLE_IMAGE_AREA = 0.85;
/** The model's box is approximate; cutting a little inside it keeps a frame or a button's edge out. */
const INSET = 0.02;
/** A dish photo smaller than this on its short side would look blurry as a cover; it gets drawn instead. */
export const MIN_COVER_SIDE = 320;
/** Bigger images aren't decoded: a pure-JS decode is CPU time, and the apps send at most ~1280 x 2800. */
const MAX_DECODE_MEGAPIXELS = 5;
const JPEG_QUALITY = 85;

/** The box as fractions, or null if it isn't one. Accepts the 0-1000 scale some models use. */
export function parseBox(value: unknown): Box | null {
  if (!Array.isArray(value) || value.length !== 4) return null;
  if (!value.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0)) return null;
  const numbers = value as number[];
  const max = Math.max(...numbers);
  const scale = max <= 1 ? 1 : max <= 1000 ? 1000 : null;
  if (scale === null) return null;
  const [left, top, right, bottom] = numbers.map((n) => n / scale);
  if (right - left < 0.05 || bottom - top < 0.05) return null;
  return { left, top, right, bottom };
}

export function planPhotoCover(answer: DishPhotoAnswer): CoverPlan {
  if (answer.dish_photo === 'none') return { action: 'draw' };
  if (answer.dish_photo !== 'part') return { action: 'keep' };
  const box = parseBox(answer.dish_photo_box);
  if (!box) return { action: 'keep' };
  if ((box.right - box.left) * (box.bottom - box.top) >= WHOLE_IMAGE_AREA) return { action: 'keep' };
  return { action: 'crop', box };
}

/** The box in pixels, a little inside the model's edges. */
export function cropRect(box: Box, width: number, height: number): { x: number; y: number; width: number; height: number } {
  const insetX = (box.right - box.left) * INSET;
  const insetY = (box.bottom - box.top) * INSET;
  const x0 = Math.max(0, Math.round((box.left + insetX) * width));
  const y0 = Math.max(0, Math.round((box.top + insetY) * height));
  const x1 = Math.min(width, Math.round((box.right - insetX) * width));
  const y1 = Math.min(height, Math.round((box.bottom - insetY) * height));
  return { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) };
}

export type CropResult =
  | { ok: true; bytes: Uint8Array; width: number; height: number }
  | { ok: false; reason: 'unsupported' | 'too_large' | 'decode_failed' | 'too_small' };

/** Cuts the box out of a JPEG or PNG and returns it as a JPEG. */
export function cropImage(bytes: Uint8Array, mimeType: string, box: Box): CropResult {
  let image: { width: number; height: number; data: Uint8Array };
  try {
    if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
      const decoded = jpeg.decode(bytes, {
        useTArray: true,
        formatAsRGBA: true,
        maxResolutionInMP: MAX_DECODE_MEGAPIXELS,
        maxMemoryUsageInMB: 128,
      });
      image = { width: decoded.width, height: decoded.height, data: decoded.data };
    } else if (mimeType === 'image/png') {
      const png = decodePng(bytes);
      if (png.width * png.height > MAX_DECODE_MEGAPIXELS * 1_000_000) return { ok: false, reason: 'too_large' };
      const rgba = toRgba(png);
      if (!rgba) return { ok: false, reason: 'unsupported' };
      image = { width: png.width, height: png.height, data: rgba };
    } else {
      return { ok: false, reason: 'unsupported' };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: /resolution|memory/i.test(message) ? 'too_large' : 'decode_failed' };
  }

  const rect = cropRect(box, image.width, image.height);
  if (Math.min(rect.width, rect.height) < MIN_COVER_SIDE) return { ok: false, reason: 'too_small' };

  const out = new Uint8Array(rect.width * rect.height * 4);
  for (let row = 0; row < rect.height; row++) {
    const from = ((rect.y + row) * image.width + rect.x) * 4;
    out.set(image.data.subarray(from, from + rect.width * 4), row * rect.width * 4);
  }
  const encoded = jpeg.encode({ data: out, width: rect.width, height: rect.height }, JPEG_QUALITY);
  return { ok: true, bytes: new Uint8Array(encoded.data), width: rect.width, height: rect.height };
}

export interface PhotoCoverResult {
  /** The cover to save: a URL, or null for none (the editor's Save draws one). Undefined keeps the uploaded photo. */
  imageUrl?: string | null;
  generated: boolean;
  usage: GeminiUsageSnapshot | null;
  /** For ai_usage_events: what was decided and why. */
  metadata: Record<string, unknown>;
}

export interface PhotoCoverDeps {
  crop?: typeof cropImage;
  store?: typeof persistUserPhotoBytes;
  draw?: (admin: Db, recipe: RecipeImageInput, options: { timeoutMs: number }) => Promise<DrawRecipeImageResult>;
}

/** Below this much time per drawing attempt there is no drawing; the photo stays the cover. */
export const MIN_DRAW_TIMEOUT_MS = 8_000;
const MAX_DRAW_TIMEOUT_MS = 20_000;

/** Two models are tried in turn, so each gets half of what's left, and a little is kept for the reply. */
export function drawTimeoutFor(msLeft: number): number | null {
  const each = Math.min(MAX_DRAW_TIMEOUT_MS, Math.floor((msLeft - 5_000) / 2));
  return each >= MIN_DRAW_TIMEOUT_MS ? each : null;
}

/**
 * Works out the cover for a Snapped photo. Never throws; every failure keeps the uploaded photo.
 * A partial import gets no drawing here: its cover is left empty, and the editor's Save draws one.
 */
export async function resolvePhotoCover(
  opts: {
    admin: Db | null;
    answer: DishPhotoAnswer;
    imageBase64: string;
    mimeType: string;
    userId: string | null;
    recipe: RecipeImageInput;
    partial: boolean;
    /** Time left for the cover before the reply has to go. */
    msLeft: number;
  },
  deps: PhotoCoverDeps = {},
): Promise<PhotoCoverResult> {
  const plan = planPhotoCover(opts.answer);
  const metadata: Record<string, unknown> = { cover_plan: plan.action };
  const keep = (reason: string): PhotoCoverResult => ({
    generated: false,
    usage: null,
    metadata: { ...metadata, cover: 'photo', cover_reason: reason },
  });

  try {
    if (plan.action === 'keep') return keep('dish_photo');

    if (plan.action === 'crop') {
      const bytes = decodeBase64(opts.imageBase64);
      if (!bytes) return keep('decode_failed');
      const cropped = (deps.crop ?? cropImage)(bytes, opts.mimeType.toLowerCase(), plan.box);
      if (cropped.ok) {
        const url = await (deps.store ?? persistUserPhotoBytes)({ bytes: cropped.bytes, mimeType: 'image/jpeg', userId: opts.userId });
        if (!url) return keep('upload_failed');
        return {
          imageUrl: url,
          generated: false,
          usage: null,
          metadata: { ...metadata, cover: 'cropped', cover_size: `${cropped.width}x${cropped.height}` },
        };
      }
      // A dish photo too small to be a cover is drawn instead; anything else keeps the photo.
      if (cropped.reason !== 'too_small') return keep(cropped.reason);
      metadata.cover_reason = 'too_small';
    }

    if (opts.partial) return { imageUrl: null, generated: false, usage: null, metadata: { ...metadata, cover: 'none' } };
    const timeoutMs = drawTimeoutFor(opts.msLeft);
    if (!opts.admin || !timeoutMs) return keep('no_time_to_draw');
    const drawn = await (deps.draw ?? ((admin, recipe, options) => drawRecipeImage(admin, recipe, options)))(
      opts.admin,
      opts.recipe,
      { timeoutMs },
    );
    if (!drawn.ok) {
      const kept = keep('draw_failed');
      return { ...kept, usage: drawn.usage, metadata: { ...kept.metadata, image_error: drawn.error.slice(0, 300) } };
    }
    return {
      imageUrl: drawn.url,
      generated: true,
      usage: drawn.usage,
      metadata: { ...metadata, cover: 'drawn', image_model: drawn.model },
    };
  } catch (err) {
    console.warn('[photoCover] failed, keeping the photo', err);
    return keep('error');
  }
}
