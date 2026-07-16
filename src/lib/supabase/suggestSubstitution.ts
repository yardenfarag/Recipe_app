import { supabase } from '@/lib/supabase/client';
import { Ingredient } from '@/types/recipe';

export interface SubstitutionAlternative {
  name: string;
  quantity: number;
  unit: string;
  reason: string;
}

export type SubstitutionStatus = 'ok' | 'failed';

export interface SubstitutionResult {
  status: SubstitutionStatus;
  alternatives?: SubstitutionAlternative[];
  message?: string;
}

/**
 * Asks the `suggest-substitution` Edge Function for 2-3 alternatives to a
 * given ingredient, using the recipe title + other ingredients as context
 * (ADR 005).
 */
export async function suggestSubstitution(
  ingredient: Ingredient,
  recipeTitle: string,
  otherIngredients: string[],
): Promise<SubstitutionResult> {
  const { data, error } = await supabase.functions.invoke<SubstitutionResult>(
    'suggest-substitution',
    {
      body: {
        ingredient,
        recipe_title: recipeTitle,
        other_ingredients: otherIngredients,
      },
    },
  );

  if (error) {
    return {
      status: 'failed',
      message: 'Could not reach the substitution service. Please try again.',
    };
  }

  return data ?? { status: 'failed', message: 'No response from the substitution service.' };
}
