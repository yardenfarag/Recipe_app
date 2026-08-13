import { localizeIngredientUnits } from '@/lib/culinaryUnits';
import { resolveRecipeSourceLanguage } from '@/lib/recipeSourceLanguage';
import { translateRecipe } from '@/lib/supabase/translateRecipe';
import type { Ingredient, Instruction, RecipeTranslationContent } from '@/types/recipe';
import type { RecipeLanguageCode } from '@/lib/recipeLanguages';
import { isRecipeLanguageCode } from '@/lib/recipeLanguages';

function withLocalizedUnits(
  content: RecipeTranslationContent,
  language: RecipeLanguageCode,
): RecipeTranslationContent {
  return {
    ...content,
    ingredients: localizeIngredientUnits(content.ingredients, language),
  };
}

export type CanonicalRecipeText = {
  title: string;
  ingredients: Ingredient[];
  instructions: Instruction[];
  source_language?: string | null;
};

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
 * Returns content in `targetLanguage`, translating via Gemini when needed.
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

  if (options.cached) {
    // Older caches may still hold source-language units — normalize on read.
    return {
      status: 'ok',
      content: withLocalizedUnits(options.cached, language),
      fromCache: true,
    };
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
    content: withLocalizedUnits(
      {
        title: result.recipe.title,
        ingredients: result.recipe.ingredients,
        instructions: result.recipe.instructions,
      },
      language,
    ),
    fromCache: false,
  };
}
