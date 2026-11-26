import { describe, expect, it } from 'vitest';

import type { AvoidList } from '../avoidList';
import type { PlanMeal } from '../../types/mealPlan';
import type { Recipe } from '../../types/recipe';
import type { RecipeCard } from '../../types/recipeCard';
import {
  candidateFromCard,
  candidateFromRecipe,
  fillWeek,
  libraryOnlyStatus,
  portionsByMeal,
  type FillInput,
  type PlanCandidate,
} from './fillWeek';

const NOW = new Date(2026, 10, 26, 9);
const NO_AVOID: AvoidList = { allergies: [], otherAllergies: [], dislikes: [] };

function candidate(id: string, patch: Partial<PlanCandidate> = {}): PlanCandidate {
  return {
    id,
    source: 'library',
    title: id,
    ingredients: [`${id} base`, 'salt'],
    tags: ['dinner'],
    minutes: 30,
    effort: 'Easy',
    cost: '$$',
    proteinPerServing: null,
    diets: null,
    contains: null,
    lastCookedAt: null,
    createdAt: null,
    favorite: false,
    ...patch,
  };
}

function input(patch: Partial<FillInput>): FillInput {
  return {
    slots: [],
    planned: [],
    candidates: [],
    avoid: NO_AVOID,
    diets: [],
    homeNames: [],
    now: NOW,
    weekend: [6, 0],
    useHub: true,
    leftovers: false,
    seed: 'seed',
    ...patch,
  };
}

const slot = (date: string, meal: PlanMeal) => ({ date, meal });
const picked = (result: ReturnType<typeof fillWeek>) => result.filled.map((meal) => meal.candidateId);

describe('fillWeek: what may be suggested', () => {
  it('never suggests a recipe with one of the cook’s allergies', () => {
    const result = fillWeek(
      input({
        slots: [slot('2026-11-26', 'dinner')],
        candidates: [
          candidate('satay', { ingredients: ['peanut butter', 'noodles'], favorite: true }),
          candidate('pasta', { ingredients: ['pasta', 'tomatoes'] }),
        ],
        avoid: { allergies: ['peanuts'], otherAllergies: [], dislikes: [] },
      }),
    );
    expect(picked(result)).toEqual(['pasta']);
  });

  it('uses the allergens a Hub card was checked for', () => {
    const result = fillWeek(
      input({
        slots: [slot('2026-11-26', 'dinner')],
        candidates: [candidate('card', { source: 'hub', contains: ['sesame'], ingredients: ['tahini dressing'] })],
        avoid: { allergies: ['sesame'], otherAllergies: [], dislikes: [] },
      }),
    );
    expect(result.empty).toHaveLength(1);
  });

  it('leaves out a recipe known not to fit a strict diet, but not a Library recipe it knows nothing about', () => {
    const result = fillWeek(
      input({
        slots: [slot('2026-11-26', 'dinner'), slot('2026-11-27', 'dinner')],
        candidates: [
          candidate('beef', { source: 'hub', diets: ['halal'] }),
          candidate('mine', { source: 'library', diets: null }),
          candidate('lentils', { source: 'hub', diets: ['vegetarian', 'vegan'] }),
        ],
        diets: ['vegetarian'],
      }),
    );
    expect(picked(result).sort()).toEqual(['lentils', 'mine']);
  });

  it('leaves out foods skipped this week', () => {
    const result = fillWeek(
      input({
        slots: [slot('2026-11-26', 'dinner')],
        candidates: [
          candidate('risotto', { ingredients: ['mushrooms', 'rice'], favorite: true }),
          candidate('soup', { ingredients: ['lentils'] }),
        ],
        adjust: { skipFoods: ['mushrooms'] },
      }),
    );
    expect(picked(result)).toEqual(['soup']);
  });

  it('takes Library recipes before Hub ones', () => {
    const result = fillWeek(
      input({
        slots: [slot('2026-11-26', 'dinner')],
        candidates: [candidate('hub', { source: 'hub' }), candidate('mine')],
      }),
    );
    expect(picked(result)).toEqual(['mine']);
  });

  it('uses no Hub recipes when they are off, except for meals the Library is thin on', () => {
    const candidates = [
      candidate('hub-dinner', { source: 'hub' }),
      candidate('hub-breakfast', { source: 'hub', tags: ['breakfast'] }),
    ];
    const off = fillWeek(input({ slots: [slot('2026-11-26', 'dinner')], candidates, useHub: false }));
    expect(off.filled).toHaveLength(0);
    const thin = fillWeek(
      input({
        slots: [slot('2026-11-26', 'breakfast'), slot('2026-11-26', 'dinner')],
        candidates,
        useHub: false,
        hubFor: ['breakfast'],
      }),
    );
    expect(picked(thin)).toEqual(['hub-breakfast']);
  });

  it('only puts a recipe at a meal it suits; lunch and dinner can stand in for each other', () => {
    const result = fillWeek(
      input({
        slots: [slot('2026-11-26', 'breakfast'), slot('2026-11-26', 'lunch')],
        candidates: [candidate('stew', { tags: ['dinner', 'stew'] })],
      }),
    );
    expect(result.empty).toEqual([slot('2026-11-26', 'breakfast')]);
    expect(picked(result)).toEqual(['stew']);
  });
});

describe('fillWeek: variety', () => {
  it('doesn’t repeat a recipe while there are others', () => {
    const days = ['2026-11-26', '2026-11-27', '2026-11-28'];
    const result = fillWeek(
      input({ slots: days.map((day) => slot(day, 'dinner')), candidates: ['a', 'b', 'c'].map((id) => candidate(id)) }),
    );
    expect(new Set(picked(result)).size).toBe(3);
  });

  it('repeats a Library recipe once when it has to, never on the next day, and says so', () => {
    const days = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26'];
    const result = fillWeek(
      input({ slots: days.map((day) => slot(day, 'dinner')), candidates: [candidate('a'), candidate('b')], useHub: false }),
    );
    const ids = picked(result);
    expect(ids).toHaveLength(4);
    for (let index = 1; index < ids.length; index += 1) expect(ids[index]).not.toBe(ids[index - 1]);
    expect(result.filled.slice(2).every((meal) => meal.reason.key === 'secondTime')).toBe(true);
  });

  it('rests what was cooked in the last two weeks', () => {
    const result = fillWeek(
      input({
        slots: [slot('2026-11-26', 'dinner')],
        candidates: [
          candidate('cooked', { lastCookedAt: new Date(2026, 10, 20).toISOString(), favorite: true }),
          candidate('fresh'),
        ],
      }),
    );
    expect(picked(result)).toEqual(['fresh']);
  });

  it('keeps longer cooking for the weekend', () => {
    const candidates = [candidate('quick', { minutes: 20 }), candidate('slow', { minutes: 90 })];
    // Thursday, then Saturday.
    expect(picked(fillWeek(input({ slots: [slot('2026-11-26', 'dinner')], candidates })))).toEqual(['quick']);
    const weekend = fillWeek(
      input({ slots: [slot('2026-11-28', 'dinner')], candidates: [candidate('slow', { minutes: 90 })] }),
    );
    expect(weekend.filled[0].reason).toEqual({ key: 'weekendLonger' });
  });

  it('honours "Quick weeknights"', () => {
    const result = fillWeek(
      input({
        slots: [slot('2026-11-26', 'dinner')],
        candidates: [
          candidate('slow', { minutes: 50, ingredients: ['spinach'], favorite: true }),
          candidate('quick', { minutes: 25 }),
        ],
        homeNames: ['spinach'],
        adjust: { quickWeeknights: true },
      }),
    );
    expect(picked(result)).toEqual(['quick']);
  });

  it('gives a different week for a different seed among equals, the same week for the same seed', () => {
    const candidates = Array.from({ length: 12 }, (_, index) => candidate(`r${index}`));
    const slots = ['2026-11-26', '2026-11-27', '2026-11-28'].map((day) => slot(day, 'dinner'));
    const first = picked(fillWeek(input({ slots, candidates, seed: 'one' })));
    expect(picked(fillWeek(input({ slots, candidates, seed: 'one' })))).toEqual(first);
    const others = ['two', 'three', 'four'].map((seed) => picked(fillWeek(input({ slots, candidates, seed }))));
    expect(others.some((ids) => ids.join() !== first.join())).toBe(true);
  });
});

describe('fillWeek: leftovers and batches', () => {
  it('turns yesterday’s dinner into today’s lunch, every other day', () => {
    const days = ['2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29'];
    const slots = days.flatMap((day) => [slot(day, 'lunch'), slot(day, 'dinner')]);
    const candidates = Array.from({ length: 10 }, (_, index) => candidate(`r${index}`, { tags: ['dinner', 'lunch'] }));
    const result = fillWeek(input({ slots, candidates, leftovers: true }));
    const lunches = result.filled.filter((meal) => meal.meal === 'lunch');
    expect(lunches.map((meal) => meal.leftoverOf?.date ?? null)).toEqual([null, '2026-11-26', null, '2026-11-28']);
    const friday = lunches[1];
    const thursdayDinner = result.filled.find((meal) => meal.date === '2026-11-26' && meal.meal === 'dinner');
    expect(friday.candidateId).toBe(thursdayDinner?.candidateId);
    expect(friday.reason).toEqual({ key: 'leftovers', date: '2026-11-26' });
  });

  it('lets a make-ahead snack cover the next two days', () => {
    const days = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26'];
    const result = fillWeek(
      input({
        slots: days.map((day) => slot(day, 'snack_pm')),
        candidates: [
          candidate('bites', { tags: ['snack', 'bites'] }),
          candidate('smoothie', { tags: ['smoothie'], minutes: 5 }),
        ],
        seed: 'x',
      }),
    );
    const first = result.filled[0];
    if (first.candidateId === 'bites') {
      expect(result.filled[1].leftoverOf).toEqual({ date: '2026-11-23', meal: 'snack_pm' });
      expect(result.filled[2].leftoverOf).toEqual({ date: '2026-11-23', meal: 'snack_pm' });
      expect(result.filled[3].leftoverOf).toBeNull();
    } else {
      expect(result.filled[1].leftoverOf).toBeNull();
    }
  });

  it('counts portions: a dinner with its leftover lunch makes two', () => {
    const portions = portionsByMeal([
      { date: '2026-11-26', meal: 'dinner', leftoverOf: null },
      { date: '2026-11-27', meal: 'lunch', leftoverOf: { date: '2026-11-26', meal: 'dinner' } },
      { date: '2026-11-27', meal: 'dinner', leftoverOf: null },
    ]);
    expect(portions.get('2026-11-26|dinner')).toBe(2);
    expect(portions.get('2026-11-27|dinner')).toBe(1);
  });
});

describe('fillWeek: reasons', () => {
  it('says when everything is at home, or names what is', () => {
    const all = fillWeek(
      input({
        slots: [slot('2026-11-26', 'dinner')],
        candidates: [candidate('a', { ingredients: ['spinach', 'chickpeas', 'salt'] })],
        homeNames: ['Spinach', 'chickpeas'],
      }),
    );
    expect(all.filled[0].reason).toEqual({ key: 'haveEverything' });
    const some = fillWeek(
      input({
        slots: [slot('2026-11-26', 'dinner')],
        candidates: [candidate('a', { ingredients: ['spinach', 'feta'], minutes: 50 })],
        homeNames: ['spinach'],
      }),
    );
    expect(some.filled[0].reason).toEqual({ key: 'usesPantry', item: 'spinach' });
  });

  it('links meals that share an ingredient', () => {
    const result = fillWeek(
      input({
        slots: [slot('2026-11-27', 'dinner')],
        planned: [{ date: '2026-11-26', meal: 'dinner', candidateId: 'tacos' }],
        candidates: [
          candidate('tacos', { ingredients: ['cilantro', 'tortillas'] }),
          candidate('soup', { ingredients: ['cilantro', 'lime', 'noodles'], minutes: 50 }),
        ],
      }),
    );
    expect(result.filled[0]).toMatchObject({ candidateId: 'soup', reason: { key: 'sharesWith', item: 'cilantro', date: '2026-11-26' } });
  });
});

describe('libraryOnlyStatus', () => {
  it('opens Library-only planning at 14 recipes that fit, and names thin meals', () => {
    const dinners = Array.from({ length: 13 }, (_, index) => candidate(`d${index}`));
    const peanut = candidate('satay', { ingredients: ['peanuts'] });
    const allergic = { allergies: ['peanuts' as const], otherAllergies: [], dislikes: [] };
    const short = libraryOnlyStatus([...dinners, peanut], allergic, [], ['breakfast', 'lunch', 'dinner']);
    expect(short).toEqual({ fitting: 13, allowed: false, thinMeals: ['breakfast'] });
    const breakfasts = Array.from({ length: 4 }, (_, index) => candidate(`b${index}`, { tags: ['breakfast'] }));
    const enough = libraryOnlyStatus([...dinners, ...breakfasts], allergic, [], ['breakfast', 'dinner', 'snack']);
    expect(enough).toEqual({ fitting: 17, allowed: true, thinMeals: ['snack'] });
  });
});

describe('candidates', () => {
  it('reads a Library recipe and a Hub card', () => {
    const recipe = {
      id: 'r1',
      title: 'Curry',
      ingredients: [{ name: 'lentils', quantity: 1, unit: 'cup' }],
      instructions: [],
      servings: 4,
      extraction_status: 'full',
      tags: ['dinner'],
      estimated_time_minutes: 40,
      calories: 1600,
      nutrition: { protein_g: 100, carbs_g: 200, fat_g: 40 },
      is_favorite: true,
    } as Recipe;
    expect(candidateFromRecipe(recipe)).toMatchObject({ source: 'library', minutes: 40, proteinPerServing: 25, favorite: true, diets: null });
    const card = {
      id: 'c1',
      title: 'Bowl',
      ingredients: [{ name: 'rice', quantity: 1, unit: 'cup' }],
      instructions: [],
      servings: 2,
      tags: ['lunch'],
      diets: ['vegan'],
      contains: ['soy'],
      created_at: '2026-11-01',
    } as unknown as RecipeCard;
    expect(candidateFromCard(card)).toMatchObject({ source: 'hub', diets: ['vegan'], contains: ['soy'], proteinPerServing: null });
  });
});
