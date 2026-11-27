import { describe, expect, it } from 'vitest';

import {
  cachedTranslationContent,
  recipeIngredientsIn,
  translatedIngredientNames,
} from './cachedTranslation';
import { localizeCulinaryUnit } from './culinaryUnits';
import type { RecipeTranslationContent } from '../types/recipe';

const recipe = {
  title: 'Lentil soup',
  source_language: 'en',
  ingredients: [
    { name: 'lentils', quantity: 1, unit: 'cup', metric: { quantity: 200, unit: 'g' } },
    { name: 'salt', quantity: 1, unit: 'tsp' },
  ],
  instructions: [{ step: 1, text: 'Simmer the lentils.' }],
};

const hebrew: RecipeTranslationContent = {
  title: 'מרק עדשים',
  // Saved before grams existed, with the unit still in English.
  ingredients: [
    { name: 'עדשים', quantity: 1, unit: 'cup' },
    { name: 'מלח', quantity: 1, unit: 'tsp' },
  ],
  instructions: [{ step: 1, text: 'לבשל את העדשים.' }],
  translation_version: 3,
};

describe('cachedTranslationContent', () => {
  it('shows a saved translation with its units in that language and the grams it lacks from the recipe', () => {
    const content = cachedTranslationContent(recipe, 'he', hebrew);
    expect(content?.title).toBe('מרק עדשים');
    expect(content?.instructions).toEqual(hebrew.instructions);
    expect(content?.translation_version).toBe(3);
    expect(content?.ingredients[0]).toMatchObject({
      name: 'עדשים',
      unit: localizeCulinaryUnit('cup', 'he', 1),
      metric: { quantity: 200 },
    });
  });

  it('is null without a saved translation, for the recipe own language, or a language Pinch does not translate into', () => {
    expect(cachedTranslationContent(recipe, 'he', null)).toBeNull();
    expect(cachedTranslationContent(recipe, 'en', hebrew)).toBeNull();
    expect(cachedTranslationContent(recipe, 'ja', hebrew)).toBeNull();
  });
});

describe('recipeIngredientsIn', () => {
  it('takes the ingredients from the translation into the app language the recipe carries', () => {
    const result = recipeIngredientsIn({ ...recipe, translations: { he: hebrew } }, 'he');
    expect(result.translated).toBe(true);
    expect(result.ingredients.map((ingredient) => ingredient.name)).toEqual(['עדשים', 'מלח']);
  });

  it('keeps the recipe own ingredients when it has no translation into that language', () => {
    expect(recipeIngredientsIn({ ...recipe, translations: { he: hebrew } }, 'ru')).toEqual({
      ingredients: recipe.ingredients,
      translated: false,
    });
    expect(recipeIngredientsIn(recipe, 'he').translated).toBe(false);
  });
});

describe('translatedIngredientNames', () => {
  it('gives the translated names row for row', () => {
    expect(translatedIngredientNames({ ...recipe, translations: { he: hebrew } }, 'he')).toEqual(['עדשים', 'מלח']);
  });

  it('is null when there is none or the rows do not line up', () => {
    expect(translatedIngredientNames(recipe, 'he')).toBeNull();
    const short = { ...hebrew, ingredients: hebrew.ingredients.slice(0, 1) };
    expect(translatedIngredientNames({ ...recipe, translations: { he: short } }, 'he')).toBeNull();
  });
});
