import { describe, expect, it } from 'vitest';

import { chooseFirstRecipes, fitsAllDiets } from './firstRecipes';
import { EMPTY_KITCHEN_PROFILE, type KitchenProfile } from './kitchenProfile';
import type { RecipeCard } from '../types/recipeCard';

function card(id: string, overrides: Partial<RecipeCard> = {}): RecipeCard {
  return {
    id,
    canonical_key: id,
    canonical_url: `https://example.com/${id}`,
    original_url: `https://example.com/${id}`,
    platform: 'web',
    title: id,
    image_url: `https://example.com/${id}.jpg`,
    ingredients: [{ name: 'rice', quantity: 1, unit: 'cup' }],
    instructions: [],
    servings: 2,
    extraction_status: 'full',
    tags: [],
    save_count: 0,
    extract_hit_count: 0,
    created_at: '2026-11-01T00:00:00Z',
    diets: [],
    ...overrides,
  };
}

const kitchen = (overrides: Partial<KitchenProfile>): KitchenProfile => ({ ...EMPTY_KITCHEN_PROFILE, ...overrides });

describe('chooseFirstRecipes', () => {
  it('keeps the Hub order when the cook gave no preferences', () => {
    const cards = [card('a'), card('b'), card('c')];
    expect(chooseFirstRecipes(cards, EMPTY_KITCHEN_PROFILE).map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });

  it('never offers a recipe with an allergen or a dislike in it', () => {
    const cards = [
      card('shrimp', { ingredients: [{ name: 'shrimp', quantity: 200, unit: 'g' }] }),
      card('cilantro', { ingredients: [{ name: 'fresh cilantro', quantity: 1, unit: 'bunch' }] }),
      card('rice'),
    ];
    const chosen = chooseFirstRecipes(cards, kitchen({ allergies: ['shellfish'], dislikes: ['cilantro'] }));
    expect(chosen.map((c) => c.id)).toEqual(['rice']);
  });

  it('puts recipes that fit every diet first, then some, then none', () => {
    const cards = [
      card('none', { diets: [] }),
      card('some', { diets: ['keto'] }),
      card('all', { diets: ['keto', 'gluten_free'] }),
    ];
    const chosen = chooseFirstRecipes(cards, kitchen({ diets: ['keto', 'gluten_free'] }));
    expect(chosen.map((c) => c.id)).toEqual(['all', 'some', 'none']);
  });

  it('puts recipes without a picture after the ones with one, and stops at the count', () => {
    const cards = [card('bare', { image_url: null }), card('a'), card('b')];
    expect(chooseFirstRecipes(cards, EMPTY_KITCHEN_PROFILE, 2).map((c) => c.id)).toEqual(['a', 'b']);
  });
});

describe('fitsAllDiets', () => {
  it('is true only with diets, all of them fitted', () => {
    expect(fitsAllDiets(card('a', { diets: ['vegan'] }), EMPTY_KITCHEN_PROFILE)).toBe(false);
    expect(fitsAllDiets(card('a', { diets: ['vegan'] }), kitchen({ diets: ['vegan'] }))).toBe(true);
    expect(fitsAllDiets(card('a', { diets: ['vegan'] }), kitchen({ diets: ['vegan', 'keto'] }))).toBe(false);
  });
});
