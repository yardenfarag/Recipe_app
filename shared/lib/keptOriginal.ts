import { resolveRecipeSourceLanguage } from './recipeSourceLanguage';
import type { Recipe } from '../types/recipe';

type KeptOriginal = NonNullable<Recipe['kitchen_original']>;

/**
 * The language a kept original (`kitchen_original`) is in, so "Revert to original" saves it with the text (PIN-188).
 * Snapshots kept before PIN-188 carry none: until something changes the recipe's language they are in the recipe's
 * own, so that is trusted, unless the text's script says otherwise.
 */
export function keptOriginalLanguage(original: KeptOriginal, recipeLanguage: string | null | undefined): string {
  return original.language ?? resolveRecipeSourceLanguage({ ...original, source_language: recipeLanguage });
}

/**
 * The kept original with its language written in. Call it before a change on a translation gives the recipe another
 * language, while `recipeLanguage` is still the one the original was kept in. Returns null when it already has one,
 * so there is nothing to save.
 */
export function stampKeptOriginalLanguage(
  original: Recipe['kitchen_original'] | null | undefined,
  recipeLanguage: string | null | undefined,
): KeptOriginal | null {
  if (!original || original.language) return null;
  return { ...original, language: keptOriginalLanguage(original, recipeLanguage) };
}
