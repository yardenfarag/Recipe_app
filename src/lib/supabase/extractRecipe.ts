import { FunctionsHttpError } from '@supabase/supabase-js';

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
}

async function invokeErrorMessage(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = (await error.context.json()) as { message?: string; error?: string };
      if (body.message) return body.message;
      if (body.error) return body.error;
    } catch {
      // Fall through to generic message.
    }
  }

  if (error instanceof Error && error.message && !error.message.includes('non-2xx')) {
    return error.message;
  }

  return 'Could not reach the extraction service. Please try again.';
}

/**
 * Sends a social URL to the `extract-recipe` Edge Function and returns the
 * structured result. Does not persist — the caller decides where to save
 * (local guest store or Supabase) per ADR 002.
 */
export async function extractRecipe(url: string): Promise<ExtractResult> {
  const { data, error } = await supabase.functions.invoke<ExtractResult>('extract-recipe', {
    body: { url },
  });

  if (error) {
    return {
      status: 'failed',
      platform: 'unknown',
      message: await invokeErrorMessage(error),
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
