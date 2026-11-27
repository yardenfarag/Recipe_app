import { localizeIngredientUnits } from './culinaryUnits';
import { localizeCachedTranslation, type CanonicalRecipeText } from './cachedTranslation';
import { resolveRecipeSourceLanguage } from './recipeSourceLanguage';
import { translateRecipe } from './supabase/translateRecipe';
import type { RecipeTranslationContent } from '../types/recipe';
import { isRecipeLanguageCode } from './recipeLanguages';

export type { CanonicalRecipeText };

export type EnsureTranslationResult =
  | { status: 'source'; content: RecipeTranslationContent }
  | { status: 'ok'; content: RecipeTranslationContent; fromCache: boolean }
  | {
      status: 'failed';
      message: string;
      code?: string;
      content: RecipeTranslationContent;
    };

/**
 * Returns content in `targetLanguage`, translating through the translate-recipe function when needed.
 * Caller is responsible for reading/writing the cache around this helper.
 */
export async function ensureRecipeTranslation(options: {
  recipe: CanonicalRecipeText;
  targetLanguage: string;
  cached?: RecipeTranslationContent | null;
}): Promise<EnsureTranslationResult> {
  const source = resolveRecipeSourceLanguage(options.recipe);
  const canonical: RecipeTranslationContent = {
    title: options.recipe.title,
    ingredients: options.recipe.ingredients,
    instructions: options.recipe.instructions,
  };

  if (options.targetLanguage === source) {
    return { status: 'source', content: canonical };
  }

  if (!isRecipeLanguageCode(options.targetLanguage)) {
    return {
      status: 'failed',
      message: 'Unsupported language.',
      content: canonical,
    };
  }

  const language = options.targetLanguage;

  // Older caches may still hold source-language units and lack grams/spoons amounts — normalize on read.
  const cachedContent = options.cached ? localizeCachedTranslation(options.cached, canonical.ingredients, language) : null;

  // A cached translation is shown as it is, whatever translator made it: opening a recipe never re-translates. Old
  // ones (before PIN-53) are redone by the admin backfill-translations function, and the display-time unit fixes
  // already apply to them here.
  if (cachedContent) {
    return { status: 'ok', content: cachedContent, fromCache: true };
  }

  const result = await translateRecipe(language, {
    title: canonical.title,
    ingredients: canonical.ingredients,
    instructions: canonical.instructions,
  });

  if (result.status === 'failed' || !result.recipe) {
    return {
      status: 'failed',
      message: result.message ?? "Couldn't translate this recipe. Try again.",
      code: result.code,
      content: canonical,
    };
  }

  return {
    status: 'ok',
    content: {
      title: result.recipe.title,
      ingredients: localizeIngredientUnits(result.recipe.ingredients, language),
      instructions: result.recipe.instructions,
      translation_version: result.translation_version ?? null,
    },
    fromCache: false,
  };
}
