import { describe, expect, it } from 'vitest';

import type { Recipe } from '../types/recipe';
import { nextTonightsPick, pickDay, recipesCookedWithin, tonightsPick, tonightsPickCandidates } from './tonightsPick';

const NOW = new Date(2026, 10, 22, 18, 30);
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

function recipe(id: string, patch: Partial<Recipe> = {}): Recipe {
  return {
    id,
    title: `Recipe ${id}`,
    ingredients: [],
    instructions: [],
    servings: 2,
    extraction_status: 'full',
    estimated_time_minutes: 25,
    effort_level: 'Easy',
    created_at: daysAgo(3),
    ...patch,
  };
}

const ids = (recipes: Recipe[]) => recipes.map((item) => item.id).sort();

describe('pickDay', () => {
  it('is the date on the cook’s own clock', () => {
    expect(pickDay(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(pickDay(NOW)).toBe('2026-11-22');
  });
});

describe('tonightsPickCandidates', () => {
  it('prefers recipes saved in the last 30 days, never cooked, that fit Cook tonight', () => {
    const library = [
      recipe('new-quick'),
      recipe('new-slow', { estimated_time_minutes: 120 }),
      recipe('new-hard', { effort_level: 'Hard' }),
      recipe('new-cooked', { last_cooked_at: daysAgo(20) }),
      recipe('old-quick', { created_at: daysAgo(45) }),
      recipe('no-time', { estimated_time_minutes: undefined }),
    ];
    expect(ids(tonightsPickCandidates(library, NOW))).toEqual(['new-quick']);
  });

  it('falls back to anything not cooked in the last two weeks', () => {
    const library = [
      recipe('old', { created_at: daysAgo(60) }),
      recipe('cooked-long-ago', { created_at: daysAgo(60), last_cooked_at: daysAgo(15) }),
      recipe('cooked-this-week', { created_at: daysAgo(60), last_cooked_at: daysAgo(2) }),
      recipe('slow-new', { estimated_time_minutes: 180 }),
    ];
    expect(ids(tonightsPickCandidates(library, NOW))).toEqual(['cooked-long-ago', 'old', 'slow-new']);
  });

  it('still suggests something when everything was cooked recently', () => {
    const library = [recipe('a', { last_cooked_at: daysAgo(1) }), recipe('b', { last_cooked_at: daysAgo(3) })];
    expect(ids(tonightsPickCandidates(library, NOW))).toEqual(['a', 'b']);
  });

  it('keeps the same order all day, whatever order the recipes arrive in, and changes it tomorrow', () => {
    const library = Array.from({ length: 12 }, (_, index) => recipe(`r${index}`));
    const morning = tonightsPickCandidates(library, new Date(2026, 10, 22, 7, 0)).map((item) => item.id);
    const evening = tonightsPickCandidates([...library].reverse(), new Date(2026, 10, 22, 22, 0)).map((item) => item.id);
    const tomorrow = tonightsPickCandidates(library, new Date(2026, 10, 23, 7, 0)).map((item) => item.id);
    expect(evening).toEqual(morning);
    expect(tomorrow).not.toEqual(morning);
    expect([...tomorrow].sort()).toEqual([...morning].sort());
  });

  it('is empty for an empty library', () => {
    expect(tonightsPickCandidates([], NOW)).toEqual([]);
    expect(tonightsPick([], NOW)).toBeNull();
  });
});

describe('tonightsPick', () => {
  const library = Array.from({ length: 6 }, (_, index) => recipe(`r${index}`));

  it('is the first candidate of the day', () => {
    expect(tonightsPick(library, NOW)?.id).toBe(tonightsPickCandidates(library, NOW)[0].id);
  });

  it('keeps the one already shown today, even when it is no longer a candidate', () => {
    const shown = { ...library[4], last_cooked_at: daysAgo(0) };
    const now = [...library.slice(0, 4), shown, library[5]];
    expect(tonightsPick(now, NOW, { day: pickDay(NOW), recipeId: 'r4' })?.id).toBe('r4');
  });

  it('forgets yesterday’s pick, and one that was deleted', () => {
    const first = tonightsPickCandidates(library, NOW)[0].id;
    expect(tonightsPick(library, NOW, { day: '2026-11-21', recipeId: 'r4' })?.id).toBe(first);
    expect(tonightsPick(library, NOW, { day: pickDay(NOW), recipeId: 'gone' })?.id).toBe(first);
  });
});

describe('nextTonightsPick', () => {
  const library = Array.from({ length: 4 }, (_, index) => recipe(`r${index}`));
  const order = tonightsPickCandidates(library, NOW).map((item) => item.id);

  it('walks through the candidates and wraps round', () => {
    expect(nextTonightsPick(library, NOW, order[0])?.id).toBe(order[1]);
    expect(nextTonightsPick(library, NOW, order[3])?.id).toBe(order[0]);
  });

  it('starts from the top when the current pick is not a candidate', () => {
    expect(nextTonightsPick(library, NOW, 'kept-from-earlier')?.id).toBe(order[0]);
  });

  it('has nothing else to offer when there is only one recipe', () => {
    expect(nextTonightsPick([library[0]], NOW, 'r0')).toBeNull();
  });
});

describe('recipesCookedWithin', () => {
  it('lists what was cooked in the last week, most recent first', () => {
    const library = [
      recipe('never'),
      recipe('yesterday', { last_cooked_at: daysAgo(1) }),
      recipe('six-days', { last_cooked_at: daysAgo(6) }),
      recipe('eight-days', { last_cooked_at: daysAgo(8) }),
      recipe('today', { last_cooked_at: daysAgo(0) }),
    ];
    expect(recipesCookedWithin(library, NOW).map((item) => item.id)).toEqual(['today', 'yesterday', 'six-days']);
  });
});
