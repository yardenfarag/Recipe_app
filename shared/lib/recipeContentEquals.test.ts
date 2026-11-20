import { describe, expect, it } from 'vitest';

import { recipeContentEquals } from './recipeContentEquals';

describe('recipeContentEquals', () => {
  const base = {
    title: 'Pasta',
    servings: 2,
    ingredients: [{ name: 'flour', quantity: 100, unit: 'g' }],
    instructions: [{ step: 1, text: 'Mix' }],
    calories: 400,
  };

  it('matches identical content', () => {
    expect(recipeContentEquals(base, { ...base })).toBe(true);
  });

  it('treats null and undefined calories as equal', () => {
    expect(
      recipeContentEquals(
        { ...base, calories: undefined },
        { ...base, calories: null },
      ),
    ).toBe(true);
  });

  it('detects ingredient changes', () => {
    expect(
      recipeContentEquals(base, {
        ...base,
        ingredients: [{ name: 'flour', quantity: 200, unit: 'g' }],
      }),
    ).toBe(false);
  });
});
