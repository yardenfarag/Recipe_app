import { effectiveSourceLanguage } from '@/lib/appLanguages';
import { translateRecipe } from '@/lib/supabase/translateRecipe';
import type { Ingredient, Instruction, RecipeTranslationContent } from '@/types/recipe';
import type { RecipeLanguageCode } from '@/lib/recipeLanguages';
import { isRecipeLanguageCode } from '@/lib/recipeLanguages';

export type CanonicalRecipeText = {
  title: string;
  ingredients: Ingredient[];
  instructions: Instruction[];
  source_language?: string | null;
};

export type EnsureTranslationResult =
  | { status: 'source'; content: RecipeTranslationContent }
  | { status: 'ok'; content: RecipeTranslationContent; fromCache: boolean }
  | { status: 'failed'; message: string; content: RecipeTranslationContent };

/**
 * Returns content in `targetLanguage`, translating via Gemini when needed.
 * Caller is responsible for reading/writing the cache around this helper.
 */
export async function ensureRecipeTranslation(options: {
  recipe: CanonicalRecipeText;
  targetLanguage: string;
  cached?: RecipeTranslationContent | null;
}): Promise<EnsureTranslationResult> {
  const source = effectiveSourceLanguage(options.recipe.source_language);
  const canonical: RecipeTranslationContent = {
    title: options.recipe.title,
    ingredients: options.recipe.ingredients,
    instructions: options.recipe.instructions,
  };

  if (options.targetLanguage === source) {
    return { status: 'source', content: canonical };
  }

  if (options.cached) {
    return { status: 'ok', content: options.cached, fromCache: true };
  }

  if (!isRecipeLanguageCode(options.targetLanguage)) {
    return {
      status: 'failed',
      message: 'Unsupported language.',
      content: canonical,
    };
  }

  const result = await translateRecipe(options.targetLanguage as RecipeLanguageCode, {
    title: canonical.title,
    ingredients: canonical.ingredients,
    instructions: canonical.instructions,
  });

  if (result.status === 'failed' || !result.recipe) {
    return {
      status: 'failed',
      message: result.message ?? "Couldn't translate this recipe. Try again.",
      content: canonical,
    };
  }

  return {
    status: 'ok',
    content: {
      title: result.recipe.title,
      ingredients: result.recipe.ingredients,
      instructions: result.recipe.instructions,
    },
    fromCache: false,
  };
}
