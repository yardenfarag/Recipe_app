import { withDisplayTitles } from './recipeDisplayTitle';
import { resolveRecipeSourceLanguage } from './recipeSourceLanguage';
import { fetchRecipeTranslationsForLanguage } from './supabase/recipeTranslations';
import type { Recipe } from '../types/recipe';

/**
 * A signed-in cook's recipes as the Library shows them in `language`: the saved translation into it of each recipe
 * written in another language (one query), and `display_title` from it. A recipe with no translation into it keeps
 * its own title. Every place that shows a Library recipe on its own (tonight's dinner from the plan, say) goes through
 * this too, so it reads the same as its card.
 */
export async function localizeRecipes(recipes: Recipe[], language: string): Promise<Recipe[]> {
  const ids = recipes.filter((recipe) => resolveRecipeSourceLanguage(recipe) !== language).map((r) => r.id);
  if (ids.length === 0) return withDisplayTitles(recipes, language);

  const saved = await fetchRecipeTranslationsForLanguage(language, ids);
  const withTranslations = recipes.map((recipe) => {
    const translation = saved[recipe.id];
    if (!translation) return recipe;
    return { ...recipe, translations: { ...(recipe.translations ?? {}), [language]: translation } };
  });
  return withDisplayTitles(withTranslations, language);
}
