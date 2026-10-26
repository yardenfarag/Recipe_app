import { beforeEach, describe, expect, it, vi } from 'vitest';

import { recipeContentUpdateRow, saveRecipe, updateRecipeContent } from '@/lib/supabase/recipes';
import type { Recipe } from '@/types/recipe';

const mocks = vi.hoisted(() => {
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const results: Record<string, { data: unknown; error: unknown }> = {};
  function chain(table: string) {
    const node: Record<string, unknown> = {};
    for (const method of ['select', 'insert', 'update', 'delete', 'eq']) {
      node[method] = (...args: unknown[]) => {
        calls.push({ table, method, args });
        return node;
      };
    }
    node.single = () => Promise.resolve(results[table] ?? { data: null, error: null });
    node.then = (resolve: (value: unknown) => void) => resolve({ error: null });
    return node;
  }
  return {
    calls,
    results,
    from: vi.fn((table: string) => chain(table)),
    getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'user-1' } }, error: null })),
  };
});

vi.mock('@/lib/supabase/client', () => ({
  supabase: { from: mocks.from, auth: { getUser: mocks.getUser } },
}));

const OVEN = [{ key: 'oven' as const, required: true, steps: [1], origin: 'source' as const }];

const base = {
  title: 'Cake',
  servings: 4,
  ingredients: [{ name: 'flour', quantity: 200, unit: 'g' }],
  instructions: [{ step: 1, text: 'Bake at 180°C.' }],
};

function updatePayload(): Record<string, unknown> {
  const call = mocks.calls.find((c) => c.table === 'recipes' && c.method === 'update');
  return call?.args[0] as Record<string, unknown>;
}

beforeEach(() => {
  mocks.calls.length = 0;
  for (const key of Object.keys(mocks.results)) delete mocks.results[key];
});

describe('recipeContentUpdateRow: appliances (ADR 017)', () => {
  it('leaves appliances alone when they are not given', () => {
    expect(recipeContentUpdateRow(base)).not.toHaveProperty('appliances');
    expect(recipeContentUpdateRow({ ...base, appliances: undefined })).not.toHaveProperty('appliances');
  });

  it('writes a new list, an empty list, or null exactly as given', () => {
    expect(recipeContentUpdateRow({ ...base, appliances: OVEN }).appliances).toEqual(OVEN);
    expect(recipeContentUpdateRow({ ...base, appliances: [] }).appliances).toEqual([]);
    expect(recipeContentUpdateRow({ ...base, appliances: null })).toHaveProperty('appliances', null);
  });

  it('keeps the existing optional-field rules', () => {
    const row = recipeContentUpdateRow({ ...base, cost_estimate: null, tags: undefined, kitchen_original: null });
    expect(row).toHaveProperty('cost_estimate', null);
    expect(row).toHaveProperty('kitchen_original', null);
    expect(row).not.toHaveProperty('tags');
  });

  it('carries appliances inside the kitchen auto-apply snapshot, so revert can restore them', () => {
    const kitchen_original = { ...base, appliances: OVEN };
    expect(recipeContentUpdateRow({ ...base, kitchen_original }).kitchen_original).toEqual(kitchen_original);
  });
});

describe('updateRecipeContent', () => {
  it('sends appliances to the recipes row when a remix changed them', async () => {
    mocks.results.recipes = { data: { id: 'r1', ...base, appliances: OVEN }, error: null };
    await updateRecipeContent('r1', { ...base, appliances: OVEN });
    expect(updatePayload().appliances).toEqual(OVEN);
  });

  it('does not touch appliances for an edit that did not change them (e.g. a swap)', async () => {
    mocks.results.recipes = { data: { id: 'r1', ...base }, error: null };
    await updateRecipeContent('r1', base);
    expect(updatePayload()).not.toHaveProperty('appliances');
  });
});

describe('saveRecipe', () => {
  it('saves the appliances that came with an extracted draft', async () => {
    mocks.results.recipes = { data: { id: 'new' }, error: null };
    const draft = { ...base, extraction_status: 'full', appliances: OVEN } as Omit<Recipe, 'id' | 'created_at' | 'user_id'>;
    await saveRecipe(draft);
    const insert = mocks.calls.find((c) => c.table === 'recipes' && c.method === 'insert');
    expect((insert?.args[0] as Record<string, unknown>).appliances).toEqual(OVEN);
  });

  it('saves a draft from before PIN-26 without an appliances field', async () => {
    mocks.results.recipes = { data: { id: 'new' }, error: null };
    await saveRecipe({ ...base, extraction_status: 'full' } as Omit<Recipe, 'id' | 'created_at' | 'user_id'>);
    const insert = mocks.calls.find((c) => c.table === 'recipes' && c.method === 'insert');
    expect(insert?.args[0]).not.toHaveProperty('appliances');
  });
});
