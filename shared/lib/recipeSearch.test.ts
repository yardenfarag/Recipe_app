import { describe, expect, it } from 'vitest';

import { filterAndSortRecipes } from './recipeListQuery';
import { matchesRecipeSearch, parseRecipeSearch } from './recipeSearch';
import type { Recipe } from '../types/recipe';

function recipe(id: string, title: string, ingredients: string[], patch: Partial<Recipe> = {}): Recipe {
  return {
    id,
    title,
    servings: 2,
    extraction_status: 'full',
    instructions: [],
    ingredients: ingredients.map((name) => ({ name, quantity: 1, unit: '' })),
    ...patch,
  };
}

const LIBRARY: Recipe[] = [
  recipe('shakshuka', 'Shakshuka', ['olive oil', 'onion', 'crushed tomatoes', 'egg', 'feta']),
  recipe('pasta', 'Lemon pasta', ['spaghetti', 'butter', 'lemon', 'parmesan']),
  recipe('tortilla', 'Tortilla española', ['patatas', 'huevos', 'cebolla']),
  recipe('frittata', 'פריטטה', ['ביצה', 'בצל', 'גבינה']),
  recipe('omelette', 'Омлет', ['яйца', 'молоко']),
  recipe('ful', 'فول', ['فول', 'بيض', 'طحينة']),
  recipe('soup', 'Tomato soup', ['tomatoes', 'cream'], { tags: ['soup', 'vegetarian'] }),
];

const found = (query: string) => filterAndSortRecipes(LIBRARY, { searchQuery: query, sort: 'title_asc' }).map((r) => r.id).sort();

describe('recipe search', () => {
  it('finds eggs from "something with eggs", in every language', () => {
    expect(found('something with eggs')).toEqual(['shakshuka']);
    expect(found('algo con huevos')).toEqual(['tortilla']);
    expect(found('משהו עם ביצים')).toEqual(['frittata']);
    expect(found('что-нибудь с яйцами')).toEqual(['omelette']);
    expect(found('شيء بالبيض')).toEqual(['ful']);
  });

  it('needs every meaningful word, in any order, from the title, ingredients or tags', () => {
    expect(found('tomato feta')).toEqual(['shakshuka']);
    expect(found('tomatoes')).toEqual(['shakshuka', 'soup']);
    expect(found('vegetarian soup')).toEqual(['soup']);
    expect(found('pasta with lemon and parmesan')).toEqual(['pasta']);
    expect(found('pasta with chicken')).toEqual([]);
  });

  it('still finds a plain word or part of one', () => {
    expect(found('Lemon')).toEqual(['pasta']);
    expect(found('parm')).toEqual(['pasta']);
    expect(found('  ')).toHaveLength(LIBRARY.length);
  });

  it('matches a query of only filler words as typed', () => {
    expect(parseRecipeSearch('with').words).toEqual([]);
    expect(matchesRecipeSearch('cooked with love', parseRecipeSearch('with'))).toBe(true);
    expect(matchesRecipeSearch('plain rice', parseRecipeSearch('with'))).toBe(false);
  });

  it('searches the words of a saved translation too', () => {
    const translated = recipe('t', 'Shakshuka', ['eggs'], {
      translations: { he: { title: 'שקשוקה', ingredients: [{ name: 'ביצים', quantity: 4, unit: '' }], instructions: [] } },
    });
    expect(filterAndSortRecipes([translated], { searchQuery: 'שקשוקה' }).map((r) => r.id)).toEqual(['t']);
  });

  it('does not stretch short words', () => {
    // "rice" has no ending to drop, so it doesn't turn into "ric" and find "ricotta".
    expect(matchesRecipeSearch('ricotta', parseRecipeSearch('rice'))).toBe(false);
  });
});
