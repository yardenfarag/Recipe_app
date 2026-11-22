import { describe, expect, it } from 'vitest';

import { firstCookSuggestion, rankCookTonight, scoreCookTonight } from './cookTonight';
import type { Recipe } from '../types/recipe';

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

describe('firstCookSuggestion', () => {
  it('suggests nothing with no recipes, or once one has been cooked', () => {
    expect(firstCookSuggestion([])).toBeNull();
    expect(
      firstCookSuggestion([recipe({ id: 'a' }), recipe({ id: 'b', last_cooked_at: '2026-11-20T18:00:00Z' })]),
    ).toBeNull();
  });

  it('prefers a quick, easy recipe, and falls back to the newest', () => {
    const slow = recipe({ id: 'slow', estimated_time_minutes: 120, effort_level: 'Hard' });
    const quick = recipe({ id: 'quick', estimated_time_minutes: 20, effort_level: 'Easy' });
    expect(firstCookSuggestion([slow, quick])?.id).toBe('quick');
    expect(firstCookSuggestion([slow])?.id).toBe('slow');
  });
});
