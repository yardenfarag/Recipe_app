import { describe, expect, it } from 'vitest';

import { planPrChecks } from './pr-checks.mjs';

describe('planPrChecks', () => {
  it('runs only the web checks and browser tests for a web/ change', () => {
    expect(planPrChecks(['web/app/(signed-in)/page.tsx'])).toEqual({ app: false, web: true, e2e: true });
  });

  it('runs only the app checks for a mobile change', () => {
    expect(planPrChecks(['src/components/RecipeView.tsx'])).toEqual({ app: true, web: false, e2e: false });
  });

  it('runs everything for shared code', () => {
    expect(planPrChecks(['shared/lib/recipes.ts'])).toEqual({ app: true, web: true, e2e: true });
  });

  it('runs the app checks for an Edge Function change, since the app tests import function code', () => {
    expect(planPrChecks(['supabase/functions/extract-recipe/index.ts'])).toEqual({
      app: true,
      web: false,
      e2e: false,
    });
  });

  it('runs everything when the generated database types change', () => {
    expect(planPrChecks(['supabase/functions/_shared/core/database.types.ts'])).toEqual({
      app: true,
      web: true,
      e2e: true,
    });
  });

  it('runs only the browser tests for a migration', () => {
    expect(planPrChecks(['supabase/migrations/20261123120000_add_thing.sql'])).toEqual({
      app: false,
      web: false,
      e2e: true,
    });
  });

  it('runs nothing for docs and top-level Markdown', () => {
    expect(planPrChecks(['docs/adr/032-thing.md', 'AGENTS.md', 'supabase/README.md'])).toEqual({
      app: false,
      web: false,
      e2e: false,
    });
  });

  it('runs the app checks for guide content, which the site tests read', () => {
    expect(planPrChecks(['content/guides/save-tiktok-recipes.md']).app).toBe(true);
  });

  it('runs the app checks for eval/, which root lint covers', () => {
    expect(planPrChecks(['eval/judge.ts']).app).toBe(true);
  });

  it('runs everything when the checks themselves change, or the file list is empty', () => {
    expect(planPrChecks(['.github/workflows/quality.yml'])).toEqual({ app: true, web: true, e2e: true });
    expect(planPrChecks([])).toEqual({ app: true, web: true, e2e: true });
  });
});
