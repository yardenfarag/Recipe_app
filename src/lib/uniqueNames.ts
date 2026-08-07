import type { Recipe } from '@/types/recipe';

/** Case-insensitive trimmed key for uniqueness checks. */
export function normalizeNameKey(name: string): string {
  return name.trim().toLowerCase();
}

/** Visible library name used when checking recipe title uniqueness. */
export function recipeVisibleName(recipe: Recipe): string {
  return (recipe.display_title ?? recipe.title).trim();
}

/** True when another recipe already uses this name (case-insensitive). */
export function isRecipeNameTaken(
  recipes: Recipe[],
  name: string,
  excludeId?: string,
): boolean {
  const key = normalizeNameKey(name);
  if (!key) return false;
  return recipes.some((recipe) => {
    if (excludeId && recipe.id === excludeId) return false;
    return (
      normalizeNameKey(recipe.title) === key ||
      normalizeNameKey(recipeVisibleName(recipe)) === key
    );
  });
}

/** True when another collection already uses this name (case-insensitive). */
export function isCollectionNameTaken(
  collections: { id: string; name: string }[],
  name: string,
  excludeId?: string,
): boolean {
  const key = normalizeNameKey(name);
  if (!key) return false;
  return collections.some((collection) => {
    if (excludeId && collection.id === excludeId) return false;
    return normalizeNameKey(collection.name) === key;
  });
}
