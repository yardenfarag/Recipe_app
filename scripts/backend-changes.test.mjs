import { describe, expect, it } from 'vitest';

import { listFunctions, planBackendDeploy } from './backend-changes.mjs';

const FUNCTIONS = ['extract-recipe', 'translate-recipe', 'nudges'];

describe('planBackendDeploy', () => {
  it('plans everything when the changes are unknown', () => {
    expect(planBackendDeploy(null, FUNCTIONS)).toEqual({
      dbTests: true,
      functionTests: true,
      allFunctions: true,
      functions: FUNCTIONS,
    });
  });

  it('deploys only the functions whose folders changed, and skips the database tests', () => {
    expect(
      planBackendDeploy(
        ['supabase/functions/translate-recipe/index.ts', 'supabase/functions/translate-recipe/prompt.test.ts'],
        FUNCTIONS,
      ),
    ).toEqual({ dbTests: false, functionTests: true, allFunctions: false, functions: ['translate-recipe'] });
  });

  it('deploys every function when shared code changes', () => {
    const plan = planBackendDeploy(['supabase/functions/_shared/recipes/substitution.ts'], FUNCTIONS);
    expect(plan.allFunctions).toBe(true);
    expect(plan.functions).toEqual(FUNCTIONS);
    expect(plan.dbTests).toBe(false);
  });

  it('deploys every function when deno.json changes', () => {
    expect(planBackendDeploy(['supabase/functions/deno.json'], FUNCTIONS).allFunctions).toBe(true);
  });

  it('runs only the database tests for a migration, and deploys no function', () => {
    expect(planBackendDeploy(['supabase/migrations/20261123120000_add_thing.sql'], FUNCTIONS)).toEqual({
      dbTests: true,
      functionTests: false,
      allFunctions: false,
      functions: [],
    });
  });

  it('checks the database and deploys every function when the generated types change', () => {
    const plan = planBackendDeploy(
      ['supabase/migrations/20261123120000_add_thing.sql', 'supabase/functions/_shared/core/database.types.ts'],
      FUNCTIONS,
    );
    expect(plan).toMatchObject({ dbTests: true, functionTests: true, allFunctions: true });
  });

  it('plans everything when config.toml or the deploy itself changes', () => {
    for (const file of ['supabase/config.toml', '.github/workflows/deploy-backend.yml', 'scripts/backend-changes.mjs']) {
      expect(planBackendDeploy([file], FUNCTIONS)).toMatchObject({ dbTests: true, allFunctions: true });
    }
  });

  it('leaves out a function that was deleted', () => {
    expect(planBackendDeploy(['supabase/functions/old-thing/index.ts'], FUNCTIONS)).toMatchObject({
      allFunctions: false,
      functions: [],
    });
  });

  it('ignores changes outside the backend', () => {
    expect(planBackendDeploy(['web/app/page.tsx', 'supabase/README.md'], FUNCTIONS)).toEqual({
      dbTests: false,
      functionTests: false,
      allFunctions: false,
      functions: [],
    });
  });
});

describe('listFunctions', () => {
  it('finds the deployable functions in the repo, without _shared', () => {
    const names = listFunctions();
    expect(names).toContain('extract-recipe');
    expect(names).not.toContain('_shared');
  });
});
