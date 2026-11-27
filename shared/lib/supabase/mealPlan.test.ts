import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchMealPlanWithTitles, fetchPlannedDinners } from './mealPlan';

const mocks = vi.hoisted(() => {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    gte: vi.fn(),
    lte: vi.fn(),
    order: vi.fn(),
    then: vi.fn(),
  };
  for (const key of ['select', 'eq', 'is', 'gte', 'lte', 'order'] as const) query[key].mockReturnValue(query);
  const from = vi.fn(() => query);
  const fetchRecipeTranslationsForLanguage = vi.fn();
  return { query, from, fetchRecipeTranslationsForLanguage };
});

vi.mock('./client', () => ({ supabase: { from: mocks.from } }));
vi.mock('./recipeTranslations', () => ({
  fetchRecipeTranslationsForLanguage: mocks.fetchRecipeTranslationsForLanguage,
}));

const rows = (data: unknown[]) =>
  mocks.query.then.mockImplementation((resolve: (v: unknown) => void) => resolve({ data, error: null }));

const dinner = (id: string, recipeId: string, recipe: Record<string, unknown> | Record<string, unknown>[]) => ({
  id,
  plan_date: '2026-11-26',
  meal: 'dinner',
  recipe_id: recipeId,
  leftover_of: null,
  servings: 2,
  locked: false,
  cooked_at: null,
  recipes: recipe,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchPlannedDinners', () => {
  it('names a recipe saved in the app language in it, and puts its ingredient names first', async () => {
    rows([
      dinner('e1', 'r1', {
        title: 'Chicken soup',
        source_language: 'en',
        estimated_time_minutes: 40,
        ingredients: [{ name: 'chicken thighs' }, { name: 'carrot' }],
      }),
      dinner('e2', 'r2', { title: 'שקשוקה', source_language: 'he', estimated_time_minutes: null, ingredients: [{ name: 'ביצים' }] }),
      dinner('e3', 'r3', { title: 'Pasta', source_language: 'en', ingredients: [{ name: 'pasta' }] }),
    ]);
    mocks.fetchRecipeTranslationsForLanguage.mockResolvedValue({
      r1: { title: 'מרק עוף', ingredients: [{ name: 'ירכי עוף' }, { name: 'גזר' }], instructions: [] },
    });

    const dinners = await fetchPlannedDinners('2026-11-26', '2026-11-27', 'he');

    // One read for the week, only for recipes written in another language.
    expect(mocks.fetchRecipeTranslationsForLanguage).toHaveBeenCalledTimes(1);
    expect(mocks.fetchRecipeTranslationsForLanguage).toHaveBeenCalledWith('he', ['r1', 'r3']);
    expect(dinners[0]).toEqual({
      id: 'e1',
      date: '2026-11-26',
      recipeId: 'r1',
      title: 'מרק עוף',
      minutes: 40,
      ingredients: ['ירכי עוף', 'גזר', 'chicken thighs', 'carrot'],
    });
    expect(dinners[1]).toMatchObject({ title: 'שקשוקה', ingredients: ['ביצים'] });
    expect(dinners[2]).toMatchObject({ title: 'Pasta', ingredients: ['pasta'] });
  });

  it('uses the recipes own words without a language, or when the translations cannot be read', async () => {
    rows([dinner('e1', 'r1', { title: 'Chicken soup', source_language: 'en', ingredients: [{ name: 'chicken' }] })]);
    expect((await fetchPlannedDinners('2026-11-26', '2026-11-27'))[0]).toMatchObject({ title: 'Chicken soup', ingredients: ['chicken'] });
    expect(mocks.fetchRecipeTranslationsForLanguage).not.toHaveBeenCalled();

    mocks.fetchRecipeTranslationsForLanguage.mockRejectedValue(new Error('offline'));
    expect((await fetchPlannedDinners('2026-11-26', '2026-11-27', 'he'))[0]).toMatchObject({ title: 'Chicken soup' });
  });
});

describe('fetchMealPlanWithTitles', () => {
  it('gives each meal its recipe title in the app language when one is saved', async () => {
    rows([
      dinner('e1', 'r1', { title: 'Chicken soup', source_language: 'en' }),
      dinner('e2', 'r2', [{ title: 'Pasta', source_language: 'en' }]),
    ]);
    mocks.fetchRecipeTranslationsForLanguage.mockResolvedValue({ r1: { title: 'מרק עוף', ingredients: [], instructions: [] } });
    const plan = await fetchMealPlanWithTitles('2026-11-23', '2026-11-29', 'he');
    expect(plan.map((entry) => [entry.id, entry.recipeId, entry.title])).toEqual([
      ['e1', 'r1', 'מרק עוף'],
      ['e2', 'r2', 'Pasta'],
    ]);
  });
});
