import { describe, expect, it } from 'vitest';

import { recipeAmountsKey, recipeTextKey, withLiveAmounts } from '@/lib/localizedRecipeKey';

const soup = {
  title: 'Root vegetable soup',
  servings: 4,
  ingredients: [
    { name: 'carrot', quantity: 2, unit: '' },
    { name: 'water', quantity: 1, unit: 'liter' },
  ],
  instructions: [{ step: 1, text: 'Simmer.' }],
};

describe('recipeTextKey', () => {
  it('ignores grams/spoons a recalculation fills in, so the translation is not reset', () => {
    const recalculated = {
      ...soup,
      ingredients: [
        { ...soup.ingredients[0], metric: { quantity: 120, unit: 'g' } },
        { ...soup.ingredients[1], metric: { quantity: 1000, unit: 'ml' }, spoons: { quantity: 4, unit: 'cup' } },
      ],
    };
    expect(recipeTextKey(recalculated)).toBe(recipeTextKey(soup));
  });

  it('changes when the words or amounts change', () => {
    expect(recipeTextKey({ ...soup, title: 'Soup' })).not.toBe(recipeTextKey(soup));
    const more = { ...soup, ingredients: [{ ...soup.ingredients[0], quantity: 3 }, soup.ingredients[1]] };
    expect(recipeTextKey(more)).not.toBe(recipeTextKey(soup));
    expect(recipeTextKey({ ...soup, instructions: [{ step: 1, text: 'Boil.' }] })).not.toBe(recipeTextKey(soup));
  });
});

describe('withLiveAmounts', () => {
  const translated = [
    { name: 'גזר', quantity: 2, unit: '' },
    { name: 'מים', quantity: 1, unit: 'ליטר', metric: { quantity: 999, unit: 'ml' } },
  ];

  it('shows the live grams/spoons on the translated rows', () => {
    const live = [
      { name: 'carrot', quantity: 2, unit: '', metric: { quantity: 120, unit: 'g' } },
      { name: 'water', quantity: 1, unit: 'liter' },
    ];
    expect(withLiveAmounts(translated, live)).toEqual([
      { name: 'גזר', quantity: 2, unit: '', metric: { quantity: 120, unit: 'g' } },
      { name: 'מים', quantity: 1, unit: 'ליטר' },
    ]);
  });

  it('keeps the display as is when the rows do not line up', () => {
    expect(withLiveAmounts(translated, [soup.ingredients[0]])).toBe(translated);
    expect(withLiveAmounts(translated, undefined)).toBe(translated);
  });
});

describe('recipeAmountsKey', () => {
  it('changes only when grams/spoons change', () => {
    const before = recipeAmountsKey(soup.ingredients);
    expect(recipeAmountsKey([{ ...soup.ingredients[0], name: 'carrots' }, soup.ingredients[1]])).toBe(before);
    expect(recipeAmountsKey([{ ...soup.ingredients[0], metric: { quantity: 120, unit: 'g' } }, soup.ingredients[1]])).not.toBe(before);
  });
});
