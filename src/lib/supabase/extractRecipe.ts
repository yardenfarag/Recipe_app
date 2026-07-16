import { supabase } from '@/lib/supabase/client';
import { Recipe } from '@/types/recipe';

export type ExtractStatus = 'full' | 'partial' | 'failed' | 'coming_soon';

/** Recipe as returned by the Edge Function (no id/user_id yet — not saved). */
export type ExtractedRecipe = Omit<Recipe, 'id' | 'user_id' | 'created_at'>;

export interface ExtractResult {
  status: ExtractStatus;
  platform: 'youtube' | 'instagram' | 'tiktok' | 'unknown';
  recipe?: ExtractedRecipe;
  message?: string;
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
    // Network / non-2xx from the function itself
    return {
      status: 'failed',
      platform: 'unknown',
      message: 'Could not reach the extraction service. Please try again.',
    };
  }

  return (
    data ?? {
      status: 'failed',
      platform: 'unknown',
      message: 'No response from the extraction service.',
    }
  );
}
