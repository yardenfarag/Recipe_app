import { describe, expect, it } from 'vitest';

import { RECIPE_LIMITS as SERVER_LIMITS } from '../../supabase/functions/_shared/recipeLimits';
import { charCount, RECIPE_LIMITS } from '@/lib/recipeLimits';

describe('recipe limits', () => {
  it('match the server limits the database enforces', () => {
    expect(RECIPE_LIMITS).toEqual(SERVER_LIMITS);
  });

  it('count characters the way Postgres does', () => {
    expect(charCount('🥕🥕')).toBe(2);
    expect(charCount('soup')).toBe(4);
  });
});
