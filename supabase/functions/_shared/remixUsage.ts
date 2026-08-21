import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { RECIPE_REMIX_LIMIT } from './pricing.ts';

export type RemixReserveResult = 'ok' | 'limited' | 'identity_required' | 'error';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseRecipeId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return UUID_RE.test(trimmed) ? trimmed : null;
}

export function parseSourceUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  return trimmed;
}

export async function reserveRecipeRemix(
  admin: SupabaseClient,
  userId: string,
  recipeId: string | null,
  sourceUrl: string | null,
): Promise<RemixReserveResult> {
  if (!recipeId && !sourceUrl) return 'identity_required';

  const { data, error } = await admin.rpc('reserve_recipe_remix', {
    p_user_id: userId,
    p_recipe_id: recipeId,
    p_source_url: sourceUrl,
    p_limit: RECIPE_REMIX_LIMIT,
  });
  if (error) {
    console.error('[remixUsage] reserve_recipe_remix', error);
    return 'error';
  }
  return Number(data) < 0 ? 'limited' : 'ok';
}

export async function refundRecipeRemix(
  admin: SupabaseClient,
  userId: string,
  recipeId: string | null,
  sourceUrl: string | null,
): Promise<boolean> {
  const { data, error } = await admin.rpc('refund_recipe_remix', {
    p_user_id: userId,
    p_recipe_id: recipeId,
    p_source_url: sourceUrl,
  });
  if (error) console.error('[remixUsage] refund_recipe_remix', error);
  return !error && data === true;
}
