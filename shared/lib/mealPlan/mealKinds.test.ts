import { describe, expect, it } from 'vitest';

import { mealFit } from './mealKinds';

const kinds = (tags: string[]) => mealFit(tags).kinds.sort();

describe('mealFit', () => {
  it('reads meals from tags', () => {
    expect(kinds(['breakfast', 'eggs'])).toEqual(['breakfast']);
    expect(kinds(['Soup', 'vegan'])).toEqual(['lunch']);
    expect(kinds(['italian', 'pasta'])).toEqual(['dinner']);
    expect(kinds(['snack', 'no-bake'])).toEqual(['snack']);
  });

  it('treats a recipe with no meal word as a main dish', () => {
    expect(kinds(['greek', 'lentils'])).toEqual(['dinner', 'lunch']);
    expect(kinds([])).toEqual(['dinner', 'lunch']);
  });

  it('keeps desserts out of main meals, but lets them be snacks', () => {
    const fit = mealFit(['dessert', 'chocolate']);
    expect(fit.kinds).toEqual(['snack']);
    expect(fit.dessert).toBe(true);
    expect(mealFit(['dessert', 'breakfast']).kinds.sort()).toEqual(['breakfast', 'snack']);
  });

  it('knows make-ahead snacks and dish types', () => {
    expect(mealFit(['snack', 'crackers']).batch).toBe(true);
    expect(mealFit(['smoothie']).batch).toBe(false);
    expect(mealFit(['dinner', 'curry', 'vegan']).dishType).toBe('curry');
    expect(mealFit(['dinner']).dishType).toBeNull();
  });
});
