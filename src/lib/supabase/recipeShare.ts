import { FunctionsHttpError } from '@supabase/supabase-js';

import { LEGAL_BASE_URL } from '@/lib/legal';
import { supabase } from '@/lib/supabase/client';
import type { ExtractedRecipe } from '@/lib/supabase/extractRecipe';

export type RecipeSharePreview = ExtractedRecipe;

type CreateShareResult =
  | { status: 'ok'; token: string; url: string; reused: boolean }
  | { status: 'failed'; message: string; code?: string };

type GetShareResult =
  | { status: 'ok'; token: string; recipe: RecipeSharePreview }
  | { status: 'failed'; message: string; code?: string };

type ClaimShareResult =
  | { status: 'ok'; recipeId: string; alreadyClaimed: boolean }
  | { status: 'failed'; message: string; code?: string };

async function invokeErrorMessage(error: unknown): Promise<{
  message: string;
  code?: string;
}> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = (await error.context.json()) as { error?: string; message?: string; code?: string };
      if (body.error || body.message) {
        return {
          message: body.error ?? body.message ?? 'Request failed',
          code: body.code,
        };
      }
    } catch {
      // Fall through.
    }
  }
  if (error instanceof Error) return { message: error.message };
  return { message: 'Request failed' };
}

/** HTTPS share page (workers/share-page): recipe preview, then opens the app or store. */
export function recipeShareLandingUrl(token: string): string {
  return `${LEGAL_BASE_URL}/s/${encodeURIComponent(token)}`;
}

/** Custom-scheme deep link used by the landing page / installed app. */
export function recipeShareAppUrl(token: string): string {
  return `pinch://s/${encodeURIComponent(token)}`;
}

export async function createRecipeShare(recipeId: string): Promise<CreateShareResult> {
  const { data, error } = await supabase.functions.invoke<{
    status?: string;
    token?: string;
    reused?: boolean;
    error?: string;
    code?: string;
  }>('recipe-share', {
    body: { action: 'create', recipe_id: recipeId },
  });

  if (error) {
    const details = await invokeErrorMessage(error);
    return { status: 'failed', message: details.message, code: details.code };
  }

  if (!data?.token) {
    return {
      status: 'failed',
      message: typeof data?.error === 'string' ? data.error : 'Could not create share link',
      code: typeof data?.code === 'string' ? data.code : undefined,
    };
  }

  return {
    status: 'ok',
    token: data.token,
    url: recipeShareLandingUrl(data.token),
    reused: data.reused === true,
  };
}

export async function getRecipeShare(token: string): Promise<GetShareResult> {
  const { data, error } = await supabase.functions.invoke<{
    status?: string;
    token?: string;
    recipe?: RecipeSharePreview;
    error?: string;
    code?: string;
  }>('recipe-share', {
    body: { action: 'get', token },
  });

  if (error) {
    const details = await invokeErrorMessage(error);
    return { status: 'failed', message: details.message, code: details.code };
  }

  if (!data?.recipe || !data.token) {
    return {
      status: 'failed',
      message: typeof data?.error === 'string' ? data.error : 'Share not found',
      code: typeof data?.code === 'string' ? data.code : 'share_not_found',
    };
  }

  return { status: 'ok', token: data.token, recipe: data.recipe };
}

export async function claimRecipeShare(token: string): Promise<ClaimShareResult> {
  const { data, error } = await supabase.functions.invoke<{
    status?: string;
    recipe_id?: string;
    already_claimed?: boolean;
    error?: string;
    code?: string;
  }>('recipe-share', {
    body: { action: 'claim', token },
  });

  if (error) {
    const details = await invokeErrorMessage(error);
    return { status: 'failed', message: details.message, code: details.code };
  }

  if (!data?.recipe_id) {
    return {
      status: 'failed',
      message: typeof data?.error === 'string' ? data.error : 'Could not save shared recipe',
      code: typeof data?.code === 'string' ? data.code : undefined,
    };
  }

  return {
    status: 'ok',
    recipeId: data.recipe_id,
    alreadyClaimed: data.already_claimed === true,
  };
}

type ShareStatusResult = { status: 'ok'; shared: boolean } | { status: 'failed'; message: string };

/** Whether the signed-in user has a live share link for this recipe. */
export async function getRecipeShareStatus(recipeId: string): Promise<ShareStatusResult> {
  const { data, error } = await supabase.functions.invoke<{ shared?: boolean; error?: string }>(
    'recipe-share',
    { body: { action: 'status', recipe_id: recipeId } },
  );
  if (error) return { status: 'failed', message: (await invokeErrorMessage(error)).message };
  return { status: 'ok', shared: data?.shared === true };
}

type RevokeShareResult = { status: 'ok'; revoked: number } | { status: 'failed'; message: string };

/** Turns off every share link the signed-in user made for this recipe. */
export async function revokeRecipeShares(recipeId: string): Promise<RevokeShareResult> {
  const { data, error } = await supabase.functions.invoke<{ revoked?: number; error?: string }>(
    'recipe-share',
    { body: { action: 'revoke', recipe_id: recipeId } },
  );
  if (error) return { status: 'failed', message: (await invokeErrorMessage(error)).message };
  return { status: 'ok', revoked: typeof data?.revoked === 'number' ? data.revoked : 0 };
}
