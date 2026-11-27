import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MealPlanEntry } from '../../types/mealPlan';
import type { Recipe } from '../../types/recipe';
import type { RecipeCard } from '../../types/recipeCard';
import { fillAndSavePlan, type FillContext, type FillRequest } from './planner';

const mocks = vi.hoisted(() => ({
  order: [] as string[],
  saveMealPlanMeals: vi.fn(),
  deleteMealPlanEntries: vi.fn(),
  claimHubCard: vi.fn(),
}));

vi.mock('../supabase/mealPlan', () => ({
  saveMealPlanMeals: mocks.saveMealPlanMeals,
  deleteMealPlanEntries: mocks.deleteMealPlanEntries,
}));
vi.mock('../supabase/cookingHub', () => ({ claimHubCard: mocks.claimHubCard }));

const recipe = (id: string): Recipe =>
  ({
    id,
    title: id,
    servings: 2,
    ingredients: [{ name: `${id} base` }, { name: 'onion' }],
    instructions: [],
    tags: ['dinner'],
  }) as unknown as Recipe;

const entry = (patch: Partial<MealPlanEntry> & Pick<MealPlanEntry, 'id' | 'date' | 'meal'>): MealPlanEntry => ({
  recipeId: 'old',
  leftoverOf: null,
  servings: 2,
  locked: false,
  cookedAt: null,
  ...patch,
});

function context(patch: Partial<FillContext>): FillContext {
  return {
    userId: 'u1',
    entries: [],
    recipes: [],
    avoid: { allergies: [], otherAllergies: [], dislikes: [] },
    diets: [],
    homeNames: [],
    weekend: [6, 0],
    defaultServings: 2,
    hubCards: () => Promise.resolve([]),
    ...patch,
  };
}

const request: FillRequest = { days: ['2026-11-30'], meals: ['dinner'], mode: 'reshuffle', useHub: true, leftovers: false, adjust: {} };

beforeEach(() => {
  mocks.order.length = 0;
  mocks.saveMealPlanMeals.mockReset();
  mocks.deleteMealPlanEntries.mockReset();
  mocks.claimHubCard.mockReset();
  mocks.deleteMealPlanEntries.mockImplementation(async (ids: string[]) => {
    mocks.order.push(`delete:${ids.join(',')}`);
  });
});

describe('fillAndSavePlan', () => {
  it('saves before it deletes, and deletes only the replaced rows the new plan did not write over', async () => {
    const replaced = entry({ id: 'x', date: '2026-11-30', meal: 'dinner' });
    // Leftovers of the replaced dinner, on a day this refill doesn't cover: they go with it.
    const leftover = entry({ id: 'l', date: '2026-12-01', meal: 'lunch', leftoverOf: 'x' });
    mocks.saveMealPlanMeals.mockImplementation(async (_user: string, meals: { date: string; meal: string }[]) => {
      mocks.order.push('save');
      // An upsert into the same meal keeps the row's id.
      return meals.map((meal) => entry({ id: 'x', date: meal.date, meal: meal.meal as 'dinner', recipeId: 'r1' }));
    });

    const outcome = await fillAndSavePlan(
      context({ entries: [replaced, leftover], recipes: [recipe('r1'), recipe('r2')] }),
      request,
      { date: '2026-11-30', meal: 'dinner' },
      ['old'],
    );

    expect(mocks.order).toEqual(['save', 'delete:l']);
    expect(outcome).toMatchObject({ filled: 1, empty: 0 });
  });

  it('keeps the old plan when the save fails', async () => {
    mocks.saveMealPlanMeals.mockRejectedValue(new Error('offline'));
    await expect(
      fillAndSavePlan(context({ entries: [entry({ id: 'x', date: '2026-11-30', meal: 'dinner' })], recipes: [recipe('r1')] }), request),
    ).rejects.toThrow('offline');
    expect(mocks.deleteMealPlanEntries).not.toHaveBeenCalled();
  });

  it('counts a meal whose Hub card could not be saved as empty', async () => {
    const card = { id: 'card-1', title: 'Soup', servings: 2, ingredients: [{ name: 'leek' }, { name: 'potato' }], tags: ['dinner'] };
    mocks.claimHubCard.mockRejectedValue(new Error('limit'));
    mocks.saveMealPlanMeals.mockImplementation(async () => []);

    const outcome = await fillAndSavePlan(
      context({ hubCards: () => Promise.resolve([card as unknown as RecipeCard]) }),
      { ...request, mode: 'fill' },
    );

    expect(mocks.claimHubCard).toHaveBeenCalledWith('card-1');
    expect(outcome).toMatchObject({ filled: 0, empty: 1, reasons: {}, savedHubRecipes: false });
  });
});
