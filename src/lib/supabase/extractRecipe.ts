import { FunctionsHttpError } from '@supabase/supabase-js';

import { getInstallId } from '@/lib/installId';
import { supabase } from '@/lib/supabase/client';
import { Recipe } from '@/types/recipe';

export type ExtractStatus = 'full' | 'partial' | 'failed' | 'coming_soon';

/** Recipe as returned by the Edge Function (no id/user_id yet — not saved). */
export type ExtractedRecipe = Omit<Recipe, 'id' | 'user_id' | 'created_at'>;

export interface ExtractResult {
  status: ExtractStatus;
  platform: 'youtube' | 'instagram' | 'tiktok' | 'unknown';
  /** Unsaved extraction, or a full saved recipe when `cached` is true. */
  recipe?: ExtractedRecipe | Recipe;
  message?: string;
  /** True when the URL was already in the user's library — no extraction ran. */
  cached?: boolean;
  code?: 'insufficient_tokens' | 'guest_limit' | 'guest_id_required' | 'metering_error' | string;
  tokens_charged?: number;
  token_balance?: number | null;
  guest_extracts_remaining?: number | null;
  tokens_required?: number;
}

async function invokeErrorMessage(error: unknown): Promise<{
  message: string;
  code?: string;
  token_balance?: number | null;
  guest_extracts_remaining?: number | null;
  tokens_required?: number;
}> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = (await error.context.json()) as ExtractResult & { error?: string };
      if (body.message || body.error) {
        return {
          message: body.message ?? body.error ?? 'Request failed',
          code: body.code,
          token_balance: body.token_balance,
          guest_extracts_remaining: body.guest_extracts_remaining,
          tokens_required: body.tokens_required,
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

/**
 * Sends a social URL to the `extract-recipe` Edge Function and returns the
 * structured result. Does not persist — the caller decides where to save
 * (local guest store or Supabase) per ADR 002.
 */
export async function extractRecipe(url: string): Promise<ExtractResult> {
  const guestInstallId = await getInstallId();
  const { data, error } = await supabase.functions.invoke<ExtractResult>('extract-recipe', {
    body: { url, guest_install_id: guestInstallId },
  });

  if (error) {
    const details = await invokeErrorMessage(error);
    return {
      status: 'failed',
      platform: 'unknown',
      message: details.message,
      code: details.code,
      token_balance: details.token_balance,
      guest_extracts_remaining: details.guest_extracts_remaining,
      tokens_required: details.tokens_required,
    };
  }

  if (data && typeof data === 'object' && 'error' in data) {
    const errBody = data as { error?: string };
    if (typeof errBody.error === 'string') {
      return {
        status: 'failed',
        platform: 'unknown',
        message: errBody.error,
      };
    }
  }

  return (
    data ?? {
      status: 'failed',
      platform: 'unknown',
      message: 'No response from the extraction service.',
    }
  );
}
