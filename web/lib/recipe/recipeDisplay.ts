import { localizeIngredientUnits, resolveCulinaryLanguage } from "@shared/lib/culinaryUnits";
import { withLiveAmounts } from "@shared/lib/localizedRecipeKey";
import { isRecipeLanguageCode, isRtlRecipeLanguage } from "@shared/lib/recipeLanguages";
import { resolveRecipeSourceLanguage } from "@shared/lib/recipeSourceLanguage";
import type { Recipe, RecipeTranslationContent } from "@shared/types/recipe";

import type { RecipeDisplay } from "@/components/recipe/types";

/** True when the recipe is written in another language than the app's, so a saved translation is worth looking up. */
export function needsTranslation(recipe: Recipe, appLanguage: string): boolean {
  return resolveRecipeSourceLanguage(recipe) !== appLanguage;
}

/**
 * The recipe as the page shows it. With a saved translation into `language` (the app's, or one picked with
 * Translate), its words are shown, its units put into that language and the grams/spoons taken from the stored row,
 * row by row (as the mobile app does), so an amount fixed after the translation was saved still shows. Without one,
 * the recipe's own text. `appLanguage` decides unit words when the recipe's language is unknown.
 */
export function buildRecipeDisplay(
  recipe: Recipe,
  language: string,
  translation: RecipeTranslationContent | null,
  appLanguage: string = language,
): RecipeDisplay {
  const source = resolveRecipeSourceLanguage(recipe);
  const translatedTo =
    translation && source !== language && isRecipeLanguageCode(language) ? language : null;

  const text =
    translatedTo && translation
      ? {
          title: translation.title,
          ingredients: withLiveAmounts(localizeIngredientUnits(translation.ingredients, translatedTo), recipe.ingredients),
          instructions: translation.instructions,
        }
      : { title: recipe.title, ingredients: recipe.ingredients, instructions: recipe.instructions };

  const contentLanguage = translatedTo ?? (isRecipeLanguageCode(source) ? source : null);
  return {
    recipe,
    ...text,
    contentLanguage,
    translated: translatedTo != null,
    direction: isRtlRecipeLanguage(contentLanguage) ? "rtl" : "ltr",
    unitLanguage: resolveCulinaryLanguage(contentLanguage, appLanguage),
  };
}
