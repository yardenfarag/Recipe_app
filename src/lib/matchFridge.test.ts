import { describe, expect, it } from 'vitest';

import { buildFridgeCatalog } from './fridgeCatalog';
import type { Recipe } from '@/types/recipe';

function recipe(id: string, extra: Partial<Recipe> = {}): Recipe {
  return {
    id,
    title: `Recipe ${id}`,
    servings: 2,
    ingredients: [{ name: 'onion', quantity: 1, unit: 'pc' }],
    instructions: [{ step: 1, text: 'Cook' }],
    extraction_status: 'full',
    ...extra,
  };
}

describe('buildFridgeCatalog', () => {
  it('includes ingredient names for a small library', () => {
    const catalog = buildFridgeCatalog([recipe('a')]);
    expect(catalog[0]?.ingredientNames).toEqual(['onion']);
  });

  it('caps at 80 recipes and drops ingredient names when the library is larger', () => {
    const many = Array.from({ length: 81 }, (_, i) => recipe(String(i)));
    const catalog = buildFridgeCatalog(many);
    expect(catalog).toHaveLength(80);
    expect(catalog[0]?.ingredientNames).toBeUndefined();
  });

  it('prefers favorites and newer recipes before the cap', () => {
    const older = recipe('old', { created_at: '2024-01-01T00:00:00.000Z' });
    const newer = recipe('new', { created_at: '2026-01-01T00:00:00.000Z' });
    const favorite = recipe('fav', {
      created_at: '2023-01-01T00:00:00.000Z',
      is_favorite: true,
    });
    const catalog = buildFridgeCatalog([older, newer, favorite]);
    expect(catalog.map((item) => item.id)).toEqual(['fav', 'new', 'old']);
  });
});
