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
  tagSet: Set<string>;
  caloriesPerServing: number | null;
  costRank: number | null;
  effortRank: number | null;
  createdAt: number;
}

function buildSortValues(recipe: Recipe): RecipeSortValues {
  const ingredientNames = recipe.ingredients.slice(0, 12).map((i) => i.name);
  const tags = (recipe.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean);
  const searchHaystack = [recipe.title, ...ingredientNames, ...tags]
    .join(' ')
    .toLocaleLowerCase();

  return {
    titleKey: recipe.title.trim().toLocaleLowerCase(),
    searchHaystack,
    tagSet: new Set(tags),
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

export type LibraryFilterOptions = {
  searchQuery?: string;
  sort?: RecipeSortKey;
  /** OR filter — recipe matches if it has any selected tag. */
  selectedTags?: string[];
  /** When set, only recipes whose id is in this set. */
  recipeIdAllowlist?: Set<string> | null;
};

/** Filters by search / tags / collection allowlist and sorts — safe for useMemo. */
export function filterAndSortRecipes(
  recipes: Recipe[],
  searchQueryOrOptions: string | LibraryFilterOptions,
  sortArg: RecipeSortKey = 'newest',
): Recipe[] {
  const options: LibraryFilterOptions =
    typeof searchQueryOrOptions === 'string'
      ? { searchQuery: searchQueryOrOptions, sort: sortArg }
      : searchQueryOrOptions;

  const normalizedQuery = (options.searchQuery ?? '').trim().toLocaleLowerCase();
  const sort = options.sort ?? 'newest';
  const selectedTags = (options.selectedTags ?? [])
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  const allowlist = options.recipeIdAllowlist;

  const withValues = recipes.map((recipe) => ({
    recipe,
    values: buildSortValues(recipe),
  }));

  const filtered = withValues.filter(({ recipe, values }) => {
    if (allowlist && !allowlist.has(recipe.id)) return false;
    if (normalizedQuery.length > 0 && !values.searchHaystack.includes(normalizedQuery)) {
      return false;
    }
    if (selectedTags.length > 0) {
      const hit = selectedTags.some((tag) => values.tagSet.has(tag));
      if (!hit) return false;
    }
    return true;
  });

  if (filtered.length <= 1) {
    return filtered.map(({ recipe }) => recipe);
  }

  return filtered
    .slice()
    .sort((a, b) => {
      const primary = compareRecipes(a.values, b.values, sort);
      if (primary !== 0) return primary;
      return a.values.titleKey.localeCompare(b.values.titleKey);
    })
    .map(({ recipe }) => recipe);
}

export function isRecipeLibraryFiltered(
  searchQuery: string,
  sort: RecipeSortKey,
  selectedTags: string[] = [],
  collectionId: string | null = null,
): boolean {
  return (
    searchQuery.trim().length > 0 ||
    sort !== 'newest' ||
    selectedTags.length > 0 ||
    collectionId != null
  );
}

/** Recipes pinned for the library Favorites section. */
export function getFavoriteRecipes(recipes: Recipe[]): Recipe[] {
  return recipes.filter((recipe) => recipe.is_favorite === true);
}
