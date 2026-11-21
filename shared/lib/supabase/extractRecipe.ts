import { FunctionsHttpError } from '@supabase/supabase-js';

import type { ExtractedRecipe, Recipe } from '../../types/recipe';
import { supabase } from './client';

export type { ExtractedRecipe };

export type ExtractStatus = 'full' | 'partial' | 'failed' | 'coming_soon';

export interface ExtractResult {
  status: ExtractStatus;
  platform: 'youtube' | 'instagram' | 'tiktok' | 'facebook' | 'web' | 'photo' | 'unknown';
  /** Unsaved extraction, or a full saved recipe when `cached` is true. */
  recipe?: ExtractedRecipe | Recipe;
  message?: string;
  /** True when the URL was already in the user's library — no extraction ran. */
  cached?: boolean;
  /** True when the recipe came from the Cooking Hub cache (unsaved, no credit). */
  from_hub?: boolean;
  code?:
    | 'subscription_required'
    | 'monthly_limit'
    | 'guest_limit'
    | 'guest_id_required'
    | 'metering_error'
    | 'video_too_long'
    | 'insufficient_credits'
    | 'insufficient_tokens'
    | 'compensation_pending'
    | 'not_food'
    | 'looks_like_dish'
    | 'no_recipe'
    | 'daily_limit'
    | 'gate_unavailable'
    | 'invalid_url'
    /** No JSON answer (504, network error): the charge is unknown, so the request id is kept. */
    | 'no_response'
    /** The import ran out of time; the credit was refunded and a retry is fine. */
    | 'extraction_timeout'
    | string;
  tokens_charged?: number;
  guest_extracts_remaining?: number | null;
  extracts_remaining?: number | null;
  free_extracts_remaining?: number | null;
  monthly_extracts_remaining?: number | null;
  subscription_status?: string | null;
  purchased_credits?: number | null;
  total_credits?: number | null;
  /** Client-side idempotency key; acknowledged only after durable handling. */
  request_id?: string;
  /** Food-gate dish name when extract should hand off to invent. */
  dish_guess?: string;
}

/**
 * What each app supplies to an import call: the request id store (shared/lib/extractionRequestId.ts, with the
 * app's storage) and, on mobile, the install id that meters guests. The web app has no guests, so it leaves that out.
 */
export interface ExtractionRequestContext {
  getOrCreateRequestId: (key: string) => Promise<string>;
  getGuestInstallId?: () => Promise<string>;
}

/** The request-id key for a photo Snap. A photo has no URL, so its size and first characters stand in. */
export function photoRequestKey(imageBase64: string): string {
  return `photo:${imageBase64.length}:${imageBase64.slice(0, 64)}`;
}

/** The request-id key for Guess the recipe from a photo. */
export function inventPhotoRequestKey(imageBase64: string): string {
  return `invent-photo:${imageBase64.length}:${imageBase64.slice(0, 64)}`;
}

/** The request-id key for Guess the recipe from a link. */
export function inventUrlRequestKey(url: string): string {
  return `invent:${url}`;
}

/** The fields an error response carries back, for the result. */
export type FunctionErrorDetails = {
  message: string;
  code?: string;
  guest_extracts_remaining?: number | null;
  extracts_remaining?: number | null;
  free_extracts_remaining?: number | null;
  monthly_extracts_remaining?: number | null;
  subscription_status?: string | null;
  purchased_credits?: number | null;
  total_credits?: number | null;
};

/**
 * The function gave no JSON answer: a 504, a network error, a worker that was stopped. Whether it charged is
 * unknown, so the request id is kept and a retry reuses it.
 */
export const NO_RESPONSE_CODE = 'no_response';

/**
 * Reads an Edge Function error into its message, code and credit fields. Without a JSON answer the code is
 * `no_response` and the message is `fallback`, never the client library's own text ("Failed to send a request…").
 */
export async function importErrorDetails(error: unknown, fallback: string): Promise<FunctionErrorDetails> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = (await error.context.json()) as ExtractResult & { error?: string };
      if (body.message || body.error) {
        return {
          message: body.message ?? body.error ?? 'Request failed',
          code: body.code,
          guest_extracts_remaining: body.guest_extracts_remaining,
          extracts_remaining: body.extracts_remaining,
          free_extracts_remaining: body.free_extracts_remaining,
          monthly_extracts_remaining: body.monthly_extracts_remaining,
          subscription_status: body.subscription_status,
          purchased_credits: body.purchased_credits,
          total_credits: body.total_credits,
        };
      }
    } catch {
      // No JSON answer: fall through.
    }
  }

  return { message: fallback, code: NO_RESPONSE_CODE };
}

/**
 * True when a retry must reuse the same request id to avoid a second charge. `extraction_timeout` is not one of
 * these: the server refunded it, so a retry is a new import.
 */
export function extractionOutcomeIsUncertain(code?: string): boolean {
  return code === 'compensation_pending' || code === 'metering_error' || code === NO_RESPONSE_CODE;
}

/** The request body's ids: always the request id, and the guest install id where the app has one. */
export async function importRequestIds(
  context: ExtractionRequestContext,
  key: string,
): Promise<{ requestId: string; ids: Record<string, string> }> {
  const guestInstallId = context.getGuestInstallId ? await context.getGuestInstallId() : undefined;
  const requestId = await context.getOrCreateRequestId(key);
  return {
    requestId,
    ids: {
      ...(guestInstallId ? { guest_install_id: guestInstallId } : {}),
      request_id: requestId,
    },
  };
}

/**
 * Sends a social URL to the `extract-recipe` Edge Function and returns the
 * structured result. Does not persist — the caller decides where to save
 * (local guest store or Supabase) per ADR 002.
 */
export async function extractRecipe(
  context: ExtractionRequestContext,
  url: string,
  opts?: { forceExtract?: boolean },
): Promise<ExtractResult> {
  const { requestId, ids } = await importRequestIds(context, url);
  return invokeImport('extract-recipe', requestId, {
    url,
    ...ids,
    ...(opts?.forceExtract ? { force_extract: true } : {}),
  });
}

/**
 * Sends a recipe photo (base64) to `extract-recipe`. Same credits as a URL Snap.
 */
export async function extractRecipeFromImage(
  context: ExtractionRequestContext,
  imageBase64: string,
  mimeType = 'image/jpeg',
  opts?: { forceExtract?: boolean },
): Promise<ExtractResult> {
  const { requestId, ids } = await importRequestIds(context, photoRequestKey(imageBase64));
  return invokeImport('extract-recipe', requestId, {
    image_base64: imageBase64,
    image_mime: mimeType,
    ...ids,
    ...(opts?.forceExtract ? { force_extract: true } : {}),
  });
}

const NO_REACH: Record<string, string> = {
  'extract-recipe': 'Could not reach the extraction service. Please try again.',
  'invent-recipe': 'Could not reach the invent service. Please try again.',
};

const NO_RESPONSE: Record<string, string> = {
  'extract-recipe': 'No response from the extraction service.',
  'invent-recipe': 'No response from the invent service.',
};

/** Imports on their way to the server, by function, request id and whether the food check is skipped. */
const inFlightImports = new Map<string, Promise<ExtractResult>>();

/**
 * Calls `extract-recipe` or `invent-recipe` and turns any failure into a `failed` result that keeps the request id.
 *
 * A second call for the same import while the first is still running gets the first one's answer instead of
 * starting another. The request id is per link or photo, so two screens that both react to one share (PIN-153:
 * 2 to 4 identical requests within the same 10 ms) would otherwise each run the whole AI pipeline; the user was
 * charged once, but we paid for every run.
 */
export function invokeImport(
  fn: 'extract-recipe' | 'invent-recipe',
  requestId: string,
  body: Record<string, unknown>,
): Promise<ExtractResult> {
  const key = `${fn}|${requestId}|${body.force_extract === true}`;
  const running = inFlightImports.get(key);
  if (running) return running;

  const call = sendImport(fn, requestId, body).finally(() => inFlightImports.delete(key));
  inFlightImports.set(key, call);
  return call;
}

async function sendImport(
  fn: 'extract-recipe' | 'invent-recipe',
  requestId: string,
  body: Record<string, unknown>,
): Promise<ExtractResult> {
  const { data, error } = await supabase.functions.invoke<ExtractResult>(fn, {
    body,
  });

  if (error) {
    // Keep the key after HTTP and transport failures. A 5xx can mean the
    // reservation is still charged and waiting for compensation.
    const details = await importErrorDetails(error, NO_REACH[fn]);
    return {
      status: 'failed',
      platform: 'unknown',
      message: details.message,
      code: details.code,
      request_id: requestId,
      guest_extracts_remaining: details.guest_extracts_remaining,
      extracts_remaining: details.extracts_remaining,
      free_extracts_remaining: details.free_extracts_remaining,
      monthly_extracts_remaining: details.monthly_extracts_remaining,
      subscription_status: details.subscription_status,
      purchased_credits: details.purchased_credits,
      total_credits: details.total_credits,
    };
  }

  if (data && typeof data === 'object' && 'error' in data) {
    const errBody = data as { error?: string };
    if (typeof errBody.error === 'string') {
      return {
        status: 'failed',
        platform: 'unknown',
        message: errBody.error,
        request_id: requestId,
      };
    }
  }

  return (
    data
      ? { ...data, request_id: requestId }
      : {
          status: 'failed',
          platform: 'unknown',
          message: NO_RESPONSE[fn],
          code: NO_RESPONSE_CODE,
          request_id: requestId,
        }
  );
}
