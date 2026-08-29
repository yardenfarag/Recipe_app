import type { Recipe } from '@/types/recipe';

export type FridgeCatalogItem = {
  id: string;
  title: string;
  ingredientNames?: string[];
  tags?: string[];
  time?: number | null;
};

const MAX_CATALOG = 80;

function createdAtMs(recipe: Recipe): number {
  if (!recipe.created_at) return 0;
  const ms = Date.parse(recipe.created_at);
  return Number.isFinite(ms) ? ms : 0;
}

export function buildFridgeCatalog(recipes: Recipe[]): FridgeCatalogItem[] {
  const dropIngredients = recipes.length > MAX_CATALOG;
  const ranked = [...recipes].sort((a, b) => {
    const fav = Number(Boolean(b.is_favorite)) - Number(Boolean(a.is_favorite));
    if (fav !== 0) return fav;
    const recency = createdAtMs(b) - createdAtMs(a);
    if (recency !== 0) return recency;
    return a.title.localeCompare(b.title);
  });

  return ranked.slice(0, MAX_CATALOG).map((recipe) => {
    const item: FridgeCatalogItem = {
      id: recipe.id,
      title: recipe.title,
    };
    if (!dropIngredients) {
      item.ingredientNames = recipe.ingredients.slice(0, 12).map((ing) => ing.name);
    }
    if (recipe.tags?.length) item.tags = recipe.tags.slice(0, 6);
    if (recipe.estimated_time_minutes != null) item.time = recipe.estimated_time_minutes;
    return item;
  });
}
