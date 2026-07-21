import { FunctionsHttpError } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase/client';
import { RecipeVariantKey } from '@/lib/recipeVariants';
import { Ingredient, Instruction } from '@/types/recipe';

export interface TransformedRecipePayload {
  ingredients: Ingredient[];
  instructions: Instruction[];
  servings: number;
  calories?: number;
  calories_reasoning?: string;
  summary: string;
}

export type TransformRecipeStatus = 'ok' | 'failed';

export interface TransformRecipeResult {
  status: TransformRecipeStatus;
  variant?: RecipeVariantKey;
  recipe?: TransformedRecipePayload;
  message?: string;
  code?: 'insufficient_tokens' | 'auth_required' | 'metering_error' | string;
  tokens_charged?: number;
  token_balance?: number | null;
  tokens_required?: number;
}

export interface TransformRecipeRequest {
  title: string;
  servings: number;
  ingredients: Ingredient[];
  instructions: Instruction[];
  calories?: number;
}

async function invokeErrorMessage(error: unknown): Promise<{
  message: string;
  code?: string;
  token_balance?: number | null;
  tokens_required?: number;
}> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = (await error.context.json()) as TransformRecipeResult & { error?: string };
      if (body.message || body.error) {
        return {
          message: body.message ?? body.error ?? 'Request failed',
          code: body.code,
          token_balance: body.token_balance,
          tokens_required: body.tokens_required,
        };
      }
    } catch {
      // Fall through.
    }
  }

  if (error instanceof Error && error.message && !error.message.includes('non-2xx')) {
    return { message: error.message };
  }

  return { message: 'Could not reach the recipe adaptation service. Please try again.' };
}

/** Asks Gemini to adapt a full recipe for a dietary/lifestyle variant. */
export async function transformRecipe(
  variant: RecipeVariantKey,
  recipe: TransformRecipeRequest,
): Promise<TransformRecipeResult> {
  const { data, error } = await supabase.functions.invoke<TransformRecipeResult>(
    'transform-recipe',
    {
      body: { variant, recipe },
    },
  );

  if (error) {
    const details = await invokeErrorMessage(error);
    return {
      status: 'failed',
      message: details.message,
      code: details.code,
      token_balance: details.token_balance,
      tokens_required: details.tokens_required,
    };
  }

  return data ?? { status: 'failed', message: 'No response from the recipe adaptation service.' };
}
