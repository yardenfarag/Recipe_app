import { describe, expect, it } from 'vitest';

import { rankCookTonight, scoreCookTonight } from '@/lib/cookTonight';
import type { Recipe } from '@/types/recipe';

function recipe(overrides: Partial<Recipe>): Recipe {
  return {
    id: overrides.id ?? '1',
    title: overrides.title ?? 'Pasta',
    ingredients: [],
    instructions: [],
    servings: 2,
    extraction_status: 'full',
    ...overrides,
  };
}

describe('scoreCookTonight', () => {
  it('rejects recipes over the time budget', () => {
    expect(
      scoreCookTonight(recipe({ estimated_time_minutes: 90 }), { maxMinutes: 30 }),
    ).toBeNull();
  });

  it('rejects recipes missing time or effort when those filters are set', () => {
    expect(scoreCookTonight(recipe({}), { maxMinutes: 45 })).toBeNull();
    expect(scoreCookTonight(recipe({ estimated_time_minutes: 20 }), { maxEffort: 'Medium' })).toBeNull();
  });

  it('ranks an easy favorite above a hard long cook', () => {
    const ranked = rankCookTonight(
      [
        recipe({
          id: 'slow',
          title: 'Roast',
          effort_level: 'Hard',
          estimated_time_minutes: 90,
        }),
        recipe({
          id: 'fast',
          title: 'Eggs',
          effort_level: 'Easy',
          estimated_time_minutes: 15,
          is_favorite: true,
        }),
      ],
      {},
    );
    expect(ranked.map((item) => item.id)).toEqual(['fast', 'slow']);
  });
});
