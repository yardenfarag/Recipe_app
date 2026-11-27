import { beforeEach, describe, expect, it, vi } from 'vitest';

import { localizeRecipes } from './localizeRecipes';
import type { Recipe } from '../types/recipe';

const mocks = vi.hoisted(() => ({ fetchForLanguage: vi.fn() }));

vi.mock('./supabase/recipeTranslations', () => ({ fetchRecipeTranslationsForLanguage: mocks.fetchForLanguage }));

function recipe(id: string, title: string, sourceLanguage: string): Recipe {
  return {
    id,
    title,
    source_language: sourceLanguage,
    ingredients: [{ name: title, quantity: 1, unit: '' }],
    instructions: [{ step: 1, text: title }],
  } as unknown as Recipe;
}

const cookies = recipe('r1', 'White Chocolate Chip Cookies', 'en');
const shakshuka = recipe('r2', 'שקשוקה', 'he');
const soup = recipe('r3', 'Lentil Soup', 'en');

const translated = (title: string) => ({ title, ingredients: [], instructions: [], translation_version: 4 });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('localizeRecipes', () => {
  it('gives each recipe written in another language its saved title in the app language, in one read', async () => {
    mocks.fetchForLanguage.mockResolvedValue({ r1: translated('עוגיות שוקולד לבן') });
    const result = await localizeRecipes([cookies, shakshuka, soup], 'he');
    expect(mocks.fetchForLanguage).toHaveBeenCalledTimes(1);
    expect(mocks.fetchForLanguage).toHaveBeenCalledWith('he', ['r1', 'r3']);
    expect(result.map((r) => r.display_title)).toEqual(['עוגיות שוקולד לבן', 'שקשוקה', 'Lentil Soup']);
    expect(result[0].translations?.he?.title).toBe('עוגיות שוקולד לבן');
  });

  it('reads nothing when every recipe is written in the app language', async () => {
    const result = await localizeRecipes([cookies, soup], 'en');
    expect(mocks.fetchForLanguage).not.toHaveBeenCalled();
    expect(result.map((r) => r.display_title)).toEqual(['White Chocolate Chip Cookies', 'Lentil Soup']);
  });

  it('follows the language it is given', async () => {
    mocks.fetchForLanguage.mockResolvedValue({ r2: translated('Shakshuka') });
    const [shown] = await localizeRecipes([shakshuka], 'en');
    expect(mocks.fetchForLanguage).toHaveBeenCalledWith('en', ['r2']);
    expect(shown.display_title).toBe('Shakshuka');
  });
});
