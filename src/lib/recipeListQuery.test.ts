import { describe, expect, it } from 'vitest';

import { filterAndSortRecipes, getFavoriteRecipes } from '@/lib/recipeListQuery';
import { Recipe } from '@/types/recipe';

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
