import { describe, expect, it } from 'vitest';

import {
  applyQuickFilters,
  filterAndSortRecipes,
  getFavoriteRecipes,
  matchesQuickFilter,
  parseQuickFilters,
  type RecipeQuickFilter,
} from './recipeListQuery';
import { Recipe } from '../types/recipe';

function mockRecipe(overrides: Partial<Recipe> & Pick<Recipe, 'id' | 'title'>): Recipe {
  return {
    extraction_status: 'full',
    ingredients: [],
    instructions: [],
    servings: 2,
    ...overrides,
  };
}

describe('filterAndSortRecipes', () => {
  const recipes: Recipe[] = [
    mockRecipe({
      id: '1',
      title: 'Zebra Pasta',
      calories: 800,
      servings: 2,
      cost_estimate: '$$$',
      effort_level: 'Hard',
      created_at: '2026-01-01T00:00:00.000Z',
      ingredients: [{ name: 'pasta', quantity: 200, unit: 'g' }],
    }),
    mockRecipe({
      id: '2',
      title: 'Apple Salad',
      calories: 200,
      servings: 2,
      cost_estimate: '$',
      effort_level: 'Easy',
      created_at: '2026-02-01T00:00:00.000Z',
      ingredients: [{ name: 'apple', quantity: 1, unit: 'pc' }],
    }),
    mockRecipe({
      id: '3',
      title: 'Banana Bread',
      calories: 600,
      servings: 2,
      cost_estimate: '$$',
      effort_level: 'Medium',
      created_at: '2026-03-01T00:00:00.000Z',
    }),
  ];

  it('sorts by title A–Z', () => {
    const result = filterAndSortRecipes(recipes, '', 'title_asc');
    expect(result.map((r) => r.title)).toEqual(['Apple Salad', 'Banana Bread', 'Zebra Pasta']);
  });

  it('sorts by lowest calories per serving', () => {
    const result = filterAndSortRecipes(recipes, '', 'calories_asc');
    expect(result.map((r) => r.title)).toEqual(['Apple Salad', 'Banana Bread', 'Zebra Pasta']);
  });

  it('sorts by cheapest first', () => {
    const result = filterAndSortRecipes(recipes, '', 'cost_asc');
    expect(result[0].title).toBe('Apple Salad');
  });

  it('sorts by easiest effort first', () => {
    const result = filterAndSortRecipes(recipes, '', 'effort_asc');
    expect(result[0].title).toBe('Apple Salad');
  });

  it('filters by title', () => {
    const result = filterAndSortRecipes(recipes, 'banana', 'title_asc');
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Banana Bread');
  });

  it('filters by ingredient name', () => {
    const result = filterAndSortRecipes(recipes, 'apple', 'newest');
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Apple Salad');
  });

  it('filters by tag in search', () => {
    const withTags = [
      ...recipes,
      mockRecipe({
        id: '4',
        title: 'Mystery Bowl',
        tags: ['vegan', 'bowl'],
        created_at: '2026-04-01T00:00:00.000Z',
      }),
    ];
    const result = filterAndSortRecipes(withTags, 'vegan', 'newest');
    expect(result.map((r) => r.id)).toEqual(['4']);
  });

  it('OR-filters by selected tags', () => {
    const withTags = [
      mockRecipe({ id: 'a', title: 'A', tags: ['pasta', 'dinner'] }),
      mockRecipe({ id: 'b', title: 'B', tags: ['dessert'] }),
      mockRecipe({ id: 'c', title: 'C', tags: ['dinner'] }),
    ];
    const result = filterAndSortRecipes(withTags, {
      selectedTags: ['pasta', 'dessert'],
      sort: 'title_asc',
    });
    expect(result.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('intersects collection allowlist with other filters', () => {
    const withTags = [
      mockRecipe({ id: 'a', title: 'A', tags: ['dinner'] }),
      mockRecipe({ id: 'b', title: 'B', tags: ['dinner'] }),
      mockRecipe({ id: 'c', title: 'C', tags: ['dessert'] }),
    ];
    const result = filterAndSortRecipes(withTags, {
      selectedTags: ['dinner'],
      recipeIdAllowlist: new Set(['b', 'c']),
      sort: 'title_asc',
    });
    expect(result.map((r) => r.id)).toEqual(['b']);
  });
});

describe('getFavoriteRecipes', () => {
  it('returns only favorited recipes', () => {
    const base: Recipe = {
      id: 'x',
      title: 'Test',
      extraction_status: 'full',
      ingredients: [],
      instructions: [],
      servings: 1,
    };
    const list = [
      { ...base, id: '1', is_favorite: true },
      { ...base, id: '2', is_favorite: false },
      { ...base, id: '3', is_favorite: true },
    ];
    expect(getFavoriteRecipes(list).map((r) => r.id)).toEqual(['1', '3']);
  });
});

describe('quick filters', () => {
  const library = [
    mockRecipe({ id: 'quick-veg', title: 'Quick veg', estimated_time_minutes: 20, tags: ['Vegetarian', 'dinner'] }),
    mockRecipe({ id: 'slow-vegan', title: 'Slow vegan', estimated_time_minutes: 90, tags: ['vegan'], platform: 'tiktok' }),
    mockRecipe({ id: 'tiktok-link', title: 'TikTok link', original_url: 'https://www.tiktok.com/@cook/video/1', last_cooked_at: '2026-11-01T00:00:00.000Z' }),
    mockRecipe({ id: 'untimed', title: 'Untimed', platform: 'web', original_url: 'https://example.com/not-tiktok.com/' }),
  ];
  const ids = (filters: RecipeQuickFilter[]) => applyQuickFilters(library, filters).map((r) => r.id);

  it('keeps everything when none is on', () => {
    expect(ids([])).toEqual(['quick-veg', 'slow-vegan', 'tiktok-link', 'untimed']);
  });

  it('under 30 minutes needs a time estimate', () => {
    expect(ids(['under30'])).toEqual(['quick-veg']);
  });

  it('veggie reads the vegetarian and vegan tags, whatever their case', () => {
    expect(ids(['veggie'])).toEqual(['quick-veg', 'slow-vegan']);
  });

  it('from TikTok reads the platform, or the link when no platform is stored', () => {
    expect(ids(['tiktok'])).toEqual(['slow-vegan', 'tiktok-link']);
  });

  it('never cooked leaves out anything with a cook date', () => {
    expect(ids(['neverCooked'])).toEqual(['quick-veg', 'slow-vegan', 'untimed']);
  });

  it('several filters must all match', () => {
    expect(ids(['veggie', 'tiktok'])).toEqual(['slow-vegan']);
    expect(matchesQuickFilter(library[0], 'under30')).toBe(true);
  });

  it('reads them from an address and drops what it does not know', () => {
    expect(parseQuickFilters('veggie, under30,nope')).toEqual(['under30', 'veggie']);
    expect(parseQuickFilters(null)).toEqual([]);
  });
});
