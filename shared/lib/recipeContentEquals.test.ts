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

  it('compares nutrition only when the echo carries it (PIN-80)', () => {
    const nutrition = { protein_g: 30, carbs_g: 40, fat_g: 18 };
    expect(recipeContentEquals({ ...base, nutrition }, { ...base })).toBe(true);
    expect(recipeContentEquals({ ...base, nutrition }, { ...base, nutrition: { ...nutrition } })).toBe(true);
    expect(recipeContentEquals({ ...base, nutrition: undefined }, { ...base, nutrition: null })).toBe(true);
    expect(recipeContentEquals({ ...base, nutrition }, { ...base, nutrition: null })).toBe(false);
  });
});
