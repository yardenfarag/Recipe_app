import { effectiveSourceLanguage } from '@/lib/appLanguages';
import type { Recipe } from '@/types/recipe';

/** Title shown in the library for the user's preferred language. */
export function recipeDisplayTitle(recipe: Recipe, preferredLanguage: string): string {
  if (recipe.display_title?.trim()) return recipe.display_title.trim();

  const source = effectiveSourceLanguage(recipe.source_language);
  if (preferredLanguage === source) return recipe.title;

  const cached = recipe.translations?.[preferredLanguage]?.title?.trim();
  return cached || recipe.title;
}

export function withDisplayTitles(recipes: Recipe[], preferredLanguage: string): Recipe[] {
  return recipes.map((recipe) => ({
    ...recipe,
    display_title: recipeDisplayTitle(recipe, preferredLanguage),
  }));
}
