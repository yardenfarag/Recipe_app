import { resolveRecipeCalories } from './recipeCalories';
import { matchesRecipeSearch, parseRecipeSearch } from './recipeSearch';
import { CostEstimate, EffortLevel, Recipe } from '../types/recipe';

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
  const ingredientNames = recipe.ingredients.map((i) => i.name);
  // A saved translation's words count too, so a recipe shown in the app's language is found in it.
  const translated = Object.values(recipe.translations ?? {}).flatMap((content) => [
    content.title,
    ...(content.ingredients ?? []).map((i) => i.name),
  ]);
  const tags = (recipe.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean);
  const displayTitle = recipe.display_title?.trim() || recipe.title;
  const searchHaystack = [recipe.title, displayTitle, ...ingredientNames, ...translated, ...tags]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase();

  return {
    titleKey: displayTitle.trim().toLocaleLowerCase(),
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

  const search = parseRecipeSearch(options.searchQuery ?? '');
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
    if (!matchesRecipeSearch(values.searchHaystack, search)) return false;
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

/** The Library's one-tap filters. Each is on or off; several on means a recipe must pass all of them. */
export type RecipeQuickFilter = 'under30' | 'veggie' | 'tiktok' | 'neverCooked';

export const RECIPE_QUICK_FILTERS: RecipeQuickFilter[] = ['under30', 'veggie', 'tiktok', 'neverCooked'];

const VEGGIE_TAGS = new Set(['vegetarian', 'vegan', 'veggie']);

export function matchesQuickFilter(recipe: Recipe, filter: RecipeQuickFilter): boolean {
  switch (filter) {
    case 'under30':
      // A recipe with no time estimate may take longer, so it isn't promised as quick.
      return recipe.estimated_time_minutes != null && recipe.estimated_time_minutes <= 30;
    case 'veggie':
      return (recipe.tags ?? []).some((tag) => VEGGIE_TAGS.has(tag.trim().toLowerCase()));
    case 'tiktok':
      return recipe.platform === 'tiktok' || (!recipe.platform && /(^|\.)tiktok\.com\//i.test(recipe.original_url ?? ''));
    case 'neverCooked':
      return !recipe.last_cooked_at;
    default:
      return true;
  }
}

export function applyQuickFilters(recipes: Recipe[], filters: RecipeQuickFilter[]): Recipe[] {
  if (filters.length === 0) return recipes;
  return recipes.filter((recipe) => filters.every((filter) => matchesQuickFilter(recipe, filter)));
}

/** Reads quick filters from text such as an address ("under30,veggie"), dropping anything unknown. */
export function parseQuickFilters(value: string | null | undefined): RecipeQuickFilter[] {
  const wanted = new Set((value ?? '').split(',').map((part) => part.trim()));
  return RECIPE_QUICK_FILTERS.filter((filter) => wanted.has(filter));
}
