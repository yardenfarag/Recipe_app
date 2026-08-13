import { FunctionsHttpError } from '@supabase/supabase-js';

import { getOrCreateExtractionRequestId } from '@/lib/extractionRequestId';
import { getInstallId } from '@/lib/installId';
import { supabase } from '@/lib/supabase/client';
import { Recipe } from '@/types/recipe';

export type ExtractStatus = 'full' | 'partial' | 'failed' | 'coming_soon';

/** Recipe as returned by the Edge Function (no id/user_id yet — not saved). */
export type ExtractedRecipe = Omit<Recipe, 'id' | 'user_id' | 'created_at'>;

export interface ExtractResult {
  status: ExtractStatus;
  platform: 'youtube' | 'instagram' | 'tiktok' | 'web' | 'unknown';
  /** Unsaved extraction, or a full saved recipe when `cached` is true. */
  recipe?: ExtractedRecipe | Recipe;
  message?: string;
  /** True when the URL was already in the user's library — no extraction ran. */
  cached?: boolean;
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
}

async function invokeErrorMessage(error: unknown): Promise<{
  message: string;
  code?: string;
  guest_extracts_remaining?: number | null;
  extracts_remaining?: number | null;
  free_extracts_remaining?: number | null;
  monthly_extracts_remaining?: number | null;
  subscription_status?: string | null;
  purchased_credits?: number | null;
  total_credits?: number | null;
}> {
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
      // Fall through to generic message.
    }
  }

  if (error instanceof Error && error.message && !error.message.includes('non-2xx')) {
    return { message: error.message };
  }

  return { message: 'Could not reach the extraction service. Please try again.' };
}

/** True when a retry must reuse the same request id to avoid a second charge. */
export function extractionOutcomeIsUncertain(code?: string): boolean {
  return code === 'compensation_pending' || code === 'metering_error';
}

/**
 * Sends a social URL to the `extract-recipe` Edge Function and returns the
 * structured result. Does not persist — the caller decides where to save
 * (local guest store or Supabase) per ADR 002.
 */
export async function extractRecipe(url: string): Promise<ExtractResult> {
  const guestInstallId = await getInstallId();
  const requestId = await getOrCreateExtractionRequestId(url);
  const { data, error } = await supabase.functions.invoke<ExtractResult>('extract-recipe', {
    body: { url, guest_install_id: guestInstallId, request_id: requestId },
  });

  if (error) {
    // Keep the key after HTTP and transport failures. A 5xx can mean the
    // reservation is still charged and waiting for compensation.
    const details = await invokeErrorMessage(error);
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
          message: 'No response from the extraction service.',
          request_id: requestId,
        }
  );
}
