import { localizeIngredientUnits } from './culinaryUnits';
import { withSourceAmounts } from './ingredientAmounts';
import { isRecipeLanguageCode, type RecipeLanguageCode } from './recipeLanguages';
import { resolveRecipeSourceLanguage } from './recipeSourceLanguage';
import type { Ingredient, Instruction, RecipeTranslationContent } from '../types/recipe';

/** A recipe's own text: what a translation is made from and shown instead of. */
export type CanonicalRecipeText = {
  title: string;
  ingredients: Ingredient[];
  instructions: Instruction[];
  source_language?: string | null;
};

/**
 * A saved translation as it is shown: its units in that language, and the grams/spoons it lacks taken from the
 * recipe's own rows (translations saved before dual amounts exist have none).
 */
export function localizeCachedTranslation(
  cached: RecipeTranslationContent,
  sourceIngredients: Ingredient[],
  language: RecipeLanguageCode,
): RecipeTranslationContent {
  return {
    ...cached,
    ingredients: localizeIngredientUnits(withSourceAmounts(cached.ingredients, sourceIngredients), language),
  };
}

/**
 * The saved translation of `recipe` into `language`, ready to show, or null: when the recipe is already in that
 * language, the language isn't one Pinch translates into, or nothing is saved. Never translates (a Hub card, or a
 * list that only shows what is cached).
 */
export function cachedTranslationContent(
  recipe: CanonicalRecipeText,
  language: string,
  cached: RecipeTranslationContent | null | undefined,
): RecipeTranslationContent | null {
  if (!cached || !isRecipeLanguageCode(language)) return null;
  if (resolveRecipeSourceLanguage(recipe) === language) return null;
  return localizeCachedTranslation(cached, recipe.ingredients, language);
}

/** A recipe that may carry its saved translations (the Library's useRecipes attaches the app language's). */
export type RecipeWithTranslations = CanonicalRecipeText & {
  translations?: Record<string, RecipeTranslationContent>;
};

/**
 * The ingredients as the cook reads them in `language`: the saved translation the recipe carries, else its own.
 * `translated` says which, so units can be read in the right language.
 */
export function recipeIngredientsIn(
  recipe: RecipeWithTranslations,
  language: string,
): { ingredients: Ingredient[]; translated: boolean } {
  const content = cachedTranslationContent(recipe, language, recipe.translations?.[language]);
  return content ? { ingredients: content.ingredients, translated: true } : { ingredients: recipe.ingredients ?? [], translated: false };
}

/**
 * The ingredient names of the saved translation into `language`, row for row with the recipe's own, or null when
 * there is none or its rows don't line up. For matching what is at home in either language.
 */
export function translatedIngredientNames(recipe: RecipeWithTranslations, language: string): string[] | null {
  const content = cachedTranslationContent(recipe, language, recipe.translations?.[language]);
  const own = recipe.ingredients ?? [];
  if (!content || content.ingredients.length !== own.length) return null;
  return content.ingredients.map((ingredient) => ingredient.name ?? '');
}
