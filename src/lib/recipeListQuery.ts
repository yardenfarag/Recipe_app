import { resolveRecipeCalories } from '@/lib/recipeCalories';
import { CostEstimate, EffortLevel, Recipe } from '@/types/recipe';

export type RecipeSortKey = 'newest' | 'calories_asc' | 'cost_asc' | 'title_asc' | 'effort_asc';

export const RECIPE_SORT_OPTIONS: { key: RecipeSortKey; label: string; icon: string }[] = [
  { key: 'newest', label: 'Newest', icon: 'time-outline' },
  { key: 'calories_asc', label: 'Lowest cal', icon: 'flame-outline' },
  { key: 'cost_asc', label: 'Cheapest', icon: 'pricetag-outline' },
  { key: 'title_asc', label: 'A–Z', icon: 'text-outline' },
  { key: 'effort_asc', label: 'Easiest', icon: 'fitness-outline' },
];

const COST_RANK: Record<CostEstimate, number> = { $: 0, $$: 1, $$$: 2 };
const EFFORT_RANK: Record<EffortLevel, number> = { Easy: 0, Medium: 1, Hard: 2 };

interface RecipeSortValues {
  titleKey: string;
  searchHaystack: string;
  caloriesPerServing: number | null;
  costRank: number | null;
  effortRank: number | null;
  createdAt: number;
}

function buildSortValues(recipe: Recipe): RecipeSortValues {
  const ingredientNames = recipe.ingredients.slice(0, 12).map((i) => i.name);
  const searchHaystack = [recipe.title, ...ingredientNames].join(' ').toLocaleLowerCase();

  return {
    titleKey: recipe.title.trim().toLocaleLowerCase(),
    searchHaystack,
    caloriesPerServing:
      recipe.calories != null
        ? resolveRecipeCalories(recipe.calories, recipe.servings).perServing
        : null,
    costRank: recipe.cost_estimate != null ? COST_RANK[recipe.cost_estimate] : null,
    effortRank: recipe.effort_level != null ? EFFORT_RANK[recipe.effort_level] : null,
    createdAt: recipe.created_at ? Date.parse(recipe.created_at) || 0 : 0,
  };
}

function compareNullableAsc(a: number | null, b: number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
}

function compareRecipes(a: RecipeSortValues, b: RecipeSortValues, sort: RecipeSortKey): number {
  switch (sort) {
    case 'calories_asc':
      return compareNullableAsc(a.caloriesPerServing, b.caloriesPerServing);
    case 'cost_asc':
      return compareNullableAsc(a.costRank, b.costRank);
    case 'effort_asc':
      return compareNullableAsc(a.effortRank, b.effortRank);
    case 'title_asc':
      return a.titleKey.localeCompare(b.titleKey);
    case 'newest':
    default:
      return b.createdAt - a.createdAt;
  }
}

/** Filters by search query and sorts in one pass — safe to wrap in useMemo. */
export function filterAndSortRecipes(
  recipes: Recipe[],
  searchQuery: string,
  sort: RecipeSortKey,
): Recipe[] {
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const withValues = recipes.map((recipe) => ({
    recipe,
    values: buildSortValues(recipe),
  }));

  const filtered =
    normalizedQuery.length === 0
      ? withValues
      : withValues.filter(({ values }) => values.searchHaystack.includes(normalizedQuery));

  if (filtered.length <= 1) {
    return filtered.map(({ recipe }) => recipe);
  }

  return filtered
    .slice()
    .sort((a, b) => {
      const primary = compareRecipes(a.values, b.values, sort);
      if (primary !== 0) return primary;
      // Stable tie-breaker so the list doesn't jump between renders.
      return a.values.titleKey.localeCompare(b.values.titleKey);
    })
    .map(({ recipe }) => recipe);
}

export function isRecipeLibraryFiltered(
  searchQuery: string,
  sort: RecipeSortKey,
): boolean {
  return searchQuery.trim().length > 0 || sort !== 'newest';
}

/** Recipes pinned for the library Favorites section. */
export function getFavoriteRecipes(recipes: Recipe[]): Recipe[] {
  return recipes.filter((recipe) => recipe.is_favorite === true);
}
