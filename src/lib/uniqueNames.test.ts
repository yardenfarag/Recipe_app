import { describe, expect, it } from 'vitest';

import {
  isCollectionNameTaken,
  isRecipeNameTaken,
  normalizeNameKey,
  recipeVisibleName,
} from '@/lib/uniqueNames';
import type { Recipe } from '@/types/recipe';

function recipe(partial: Partial<Recipe> & Pick<Recipe, 'id' | 'title'>): Recipe {
  return {
    servings: 2,
    ingredients: [],
    instructions: [],
    extraction_status: 'full',
    ...partial,
  };
}

describe('uniqueNames', () => {
  it('normalizes names case-insensitively', () => {
    expect(normalizeNameKey('  Pasta  ')).toBe('pasta');
  });

  it('prefers display_title for visible name', () => {
    expect(
      recipeVisibleName(recipe({ id: '1', title: 'Soup', display_title: 'Sopa' })),
    ).toBe('Sopa');
  });

  it('detects duplicate recipe names', () => {
    const recipes = [
      recipe({ id: 'a', title: 'Chili' }),
      recipe({ id: 'b', title: 'Tacos', display_title: 'Taco Night' }),
    ];
    expect(isRecipeNameTaken(recipes, 'chili')).toBe(true);
    expect(isRecipeNameTaken(recipes, 'Taco Night')).toBe(true);
    expect(isRecipeNameTaken(recipes, 'chili', 'a')).toBe(false);
    expect(isRecipeNameTaken(recipes, 'New dish')).toBe(false);
  });

  it('detects duplicate collection names', () => {
    const collections = [
      { id: '1', name: 'Weeknight' },
      { id: '2', name: 'Baking' },
    ];
    expect(isCollectionNameTaken(collections, 'weeknight')).toBe(true);
    expect(isCollectionNameTaken(collections, 'Weeknight', '1')).toBe(false);
    expect(isCollectionNameTaken(collections, 'Desserts')).toBe(false);
  });
});
