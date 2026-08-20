import { RecipeLanguageCode } from '@/lib/recipeLanguages';
import { supabase } from '@/lib/supabase/client';
import { Ingredient, Instruction } from '@/types/recipe';

export interface SubstitutionAlternative {
  name: string;
  quantity: number;
  unit: string;
  metric?: Ingredient['metric'];
  spoons?: Ingredient['spoons'];
  reason: string;
}

export type SubstitutionStatus = 'ok' | 'failed';

export interface SubstitutionResult {
  status: SubstitutionStatus;
  alternatives?: SubstitutionAlternative[];
  message?: string;
}

export interface RewriteInstructionsResult {
  status: SubstitutionStatus;
  instructions?: { step: number; text: string }[];
  message?: string;
}

/**
 * Asks the `suggest-substitution` Edge Function for 2-3 alternatives to a
 * given ingredient, using the recipe title + other ingredients as context
 * (ADR 005). Pass `language` when the recipe is translated so swaps match
 * that locale's supermarket (e.g. Hebrew → Israel).
 */
export async function suggestSubstitution(
  ingredient: Ingredient,
  recipeTitle: string,
  otherIngredients: string[],
  language?: RecipeLanguageCode | null,
): Promise<SubstitutionResult> {
  const { data, error } = await supabase.functions.invoke<SubstitutionResult>(
    'suggest-substitution',
    {
      body: {
        mode: 'suggest',
        ingredient,
        recipe_title: recipeTitle,
        other_ingredients: otherIngredients,
        ...(language ? { language } : {}),
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

/**
 * Rewrites instruction steps so they match an applied ingredient swap.
 * Call when the user taps "Use this" so the method stays consistent.
 */
export async function rewriteInstructionsForSubstitution(
  ingredient: Ingredient,
  alternative: Pick<SubstitutionAlternative, 'name' | 'quantity' | 'unit'>,
  instructions: Instruction[],
  recipeTitle: string,
  language?: RecipeLanguageCode | null,
): Promise<RewriteInstructionsResult> {
  const { data, error } = await supabase.functions.invoke<RewriteInstructionsResult>(
    'suggest-substitution',
    {
      body: {
        mode: 'rewrite_instructions',
        ingredient,
        alternative,
        instructions: instructions.map((step) => ({
          step: step.step,
          text: step.text,
        })),
        recipe_title: recipeTitle,
        ...(language ? { language } : {}),
      },
    },
  );

  if (error) {
    return {
      status: 'failed',
      message: 'Could not update the recipe steps. Please try again.',
    };
  }

  return (
    data ?? {
      status: 'failed',
      message: 'No response from the substitution service.',
    }
  );
}
