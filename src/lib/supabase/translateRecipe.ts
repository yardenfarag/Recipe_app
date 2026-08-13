import { FunctionsHttpError } from '@supabase/supabase-js';

import { localizeIngredientUnits } from '@/lib/culinaryUnits';
import { RecipeLanguageCode } from '@/lib/recipeLanguages';
import { runSingleFlight } from '@/lib/singleFlight';
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
  code?: 'auth_required' | 'daily_limit' | 'metering_error' | string;
}

export interface TranslateRecipeRequest {
  title: string;
  ingredients: Ingredient[];
  instructions: Instruction[];
}

const translationFlights = new Map<string, Promise<TranslateRecipeResult>>();

async function invokeErrorDetails(error: unknown): Promise<{ message: string; code?: string }> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = (await error.context.json()) as {
        message?: string;
        error?: string;
        code?: string;
      };
      if (body.message || body.error) {
        return {
          message: body.message ?? body.error ?? 'Request failed',
          code: body.code,
        };
      }
    } catch {
      // Fall through.
    }
  }

  if (error instanceof Error && error.message && !error.message.includes('non-2xx')) {
    return { message: error.message };
  }

  return { message: 'Could not reach the translation service. Please try again.' };
}

/** Translates recipe title, ingredients, and instructions into a target language. */
export async function translateRecipe(
  targetLanguage: RecipeLanguageCode,
  recipe: TranslateRecipeRequest,
): Promise<TranslateRecipeResult> {
  const key = `${targetLanguage}:${JSON.stringify(recipe)}`;
  return runSingleFlight(translationFlights, key, () =>
    invokeTranslation(targetLanguage, recipe),
  );
}

async function invokeTranslation(
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
    const details = await invokeErrorDetails(error);
    return {
      status: 'failed',
      message: details.message,
      code: details.code,
    };
  }

  if (!data || data.status === 'failed' || !data.recipe) {
    return data ?? { status: 'failed', message: 'No response from the translation service.' };
  }

  // Ensure units are in the target language even if an older edge build
  // still returns source-language unit strings.
  return {
    ...data,
    recipe: {
      ...data.recipe,
      ingredients: localizeIngredientUnits(data.recipe.ingredients, targetLanguage),
    },
  };
}
