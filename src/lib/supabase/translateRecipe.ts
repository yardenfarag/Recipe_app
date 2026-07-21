import { FunctionsHttpError } from '@supabase/supabase-js';

import { RecipeLanguageCode } from '@/lib/recipeLanguages';
import { supabase } from '@/lib/supabase/client';
import { Ingredient, Instruction } from '@/types/recipe';

export interface TranslatedRecipePayload {
  title: string;
  ingredients: Ingredient[];
  instructions: Instruction[];
}

export interface TranslateRecipeResult {
  status: 'ok' | 'failed';
  target_language?: RecipeLanguageCode;
  recipe?: TranslatedRecipePayload;
  message?: string;
}

export interface TranslateRecipeRequest {
  title: string;
  ingredients: Ingredient[];
  instructions: Instruction[];
}

async function invokeErrorMessage(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = (await error.context.json()) as { message?: string; error?: string };
      if (body.message) return body.message;
      if (body.error) return body.error;
    } catch {
      // Fall through.
    }
  }

  if (error instanceof Error && error.message && !error.message.includes('non-2xx')) {
    return error.message;
  }

  return 'Could not reach the translation service. Please try again.';
}

/** Translates recipe title, ingredients, and instructions into a target language. */
export async function translateRecipe(
  targetLanguage: RecipeLanguageCode,
  recipe: TranslateRecipeRequest,
): Promise<TranslateRecipeResult> {
  const { data, error } = await supabase.functions.invoke<TranslateRecipeResult>(
    'translate-recipe',
    {
      body: {
        target_language: targetLanguage,
        recipe,
      },
    },
  );

  if (error) {
    return {
      status: 'failed',
      message: await invokeErrorMessage(error),
    };
  }

  return data ?? { status: 'failed', message: 'No response from the translation service.' };
}
