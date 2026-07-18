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
}

export interface TransformRecipeRequest {
  title: string;
  servings: number;
  ingredients: Ingredient[];
  instructions: Instruction[];
  calories?: number;
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
    return {
      status: 'failed',
      message: 'Could not reach the recipe adaptation service. Please try again.',
    };
  }

  return data ?? { status: 'failed', message: 'No response from the recipe adaptation service.' };
}
