import { describe, expect, it } from 'vitest';

import {
  addDays,
  cleanMealPlanPrefs,
  defaultPlanWeek,
  isPlannableWeek,
  mealsOfDay,
  planningWeeks,
  plannableDays,
  weekOf,
  weekStartFor,
  weekendFor,
} from './week';

describe('week start and weekend', () => {
  it('starts on Sunday in Hebrew and Arabic, Monday otherwise', () => {
    expect(weekStartFor('he')).toBe(0);
    expect(weekStartFor('ar-EG')).toBe(0);
    expect(weekStartFor('en')).toBe(1);
    expect(weekStartFor('ru')).toBe(1);
    expect(weekStartFor('es_ES')).toBe(1);
  });

  it('has a Friday–Saturday weekend in Hebrew and Arabic', () => {
    expect(weekendFor('he')).toEqual([5, 6]);
    expect(weekendFor('en')).toEqual([6, 0]);
  });
});

describe('days', () => {
  it('adds days across a month, a year and a clock change', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
    expect(addDays('2026-11-27', -5)).toBe('2026-11-22');
  });
});

describe('weekOf', () => {
  it('gives the Monday week in English', () => {
    // Thursday 26 November 2026.
    expect(weekOf('2026-11-26', 1).days).toEqual([
      '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29',
    ]);
  });

  it('gives the Sunday week in Hebrew, and a Sunday starts its own week', () => {
    expect(weekOf('2026-11-26', 0).start).toBe('2026-11-22');
    expect(weekOf('2026-11-29', 0).start).toBe('2026-11-29');
    expect(weekOf('2026-11-29', 1).start).toBe('2026-11-23');
  });
});

describe('planning weeks', () => {
  it('plans this week and next, not further and not earlier', () => {
    const { thisWeek, nextWeek } = planningWeeks('2026-11-26', 1);
    expect(thisWeek.start).toBe('2026-11-23');
    expect(nextWeek.start).toBe('2026-11-30');
    expect(isPlannableWeek('2026-11-23', '2026-11-26', 1)).toBe(true);
    expect(isPlannableWeek('2026-11-30', '2026-11-26', 1)).toBe(true);
    expect(isPlannableWeek('2026-12-07', '2026-11-26', 1)).toBe(false);
    expect(isPlannableWeek('2026-11-16', '2026-11-26', 1)).toBe(false);
  });

  it('only plans today and later', () => {
    expect(plannableDays(weekOf('2026-11-26', 1), '2026-11-26')).toEqual([
      '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29',
    ]);
  });

  it('opens on next week when two days or fewer are left', () => {
    expect(defaultPlanWeek('2026-11-26', 1).start).toBe('2026-11-23');
    expect(defaultPlanWeek('2026-11-28', 1).start).toBe('2026-11-30');
    // Hebrew week: Friday 27 leaves Friday and Saturday.
    expect(defaultPlanWeek('2026-11-27', 0).start).toBe('2026-11-29');
  });
});

describe('mealsOfDay', () => {
  it('puts snacks between meals', () => {
    expect(mealsOfDay(['breakfast', 'lunch', 'dinner'], 0)).toEqual(['breakfast', 'lunch', 'dinner']);
    expect(mealsOfDay(['breakfast', 'lunch', 'dinner'], 1)).toEqual(['breakfast', 'lunch', 'snack_pm', 'dinner']);
    expect(mealsOfDay(['dinner', 'breakfast'], 2)).toEqual(['breakfast', 'snack_am', 'snack_pm', 'dinner']);
  });
});

describe('cleanMealPlanPrefs', () => {
  it('fills in defaults and drops what it doesn’t know', () => {
    expect(cleanMealPlanPrefs(null)).toEqual({
      meals: ['breakfast', 'lunch', 'dinner'],
      snacksPerDay: 0,
      useHub: true,
      leftovers: true,
    });
    expect(cleanMealPlanPrefs({ meals: ['dinner', 'brunch'], snacksPerDay: 2, useHub: false, extra: 1 })).toEqual({
      meals: ['dinner'],
      snacksPerDay: 2,
      useHub: false,
      leftovers: true,
    });
    expect(cleanMealPlanPrefs({ meals: [], snacksPerDay: 5 }).meals).toEqual(['breakfast', 'lunch', 'dinner']);
    expect(cleanMealPlanPrefs({ snacksPerDay: 5 }).snacksPerDay).toBe(0);
  });
});
