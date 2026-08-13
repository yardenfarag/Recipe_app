import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  finalizeGuestRecipeMigration,
  migrateGuestRecipesToSupabase,
} from './migrateGuestRecipes';

const mocks = vi.hoisted(() => ({
  getGuestRecipes: vi.fn(),
  clearGuestRecipes: vi.fn(),
  prepareIdMap: vi.fn(),
  updateMapping: vi.fn(),
  clearJournal: vi.fn(),
  insertRecipe: vi.fn(),
  findMappedRecipe: vi.fn(),
}));

vi.mock('@/lib/guestRecipes', () => ({
  getGuestRecipes: mocks.getGuestRecipes,
  clearGuestRecipes: mocks.clearGuestRecipes,
}));
vi.mock('@/lib/guestMigrationJournal', () => ({
  prepareGuestRecipeIdMap: mocks.prepareIdMap,
  updateGuestRecipeIdMapping: mocks.updateMapping,
  clearGuestMigrationJournal: mocks.clearJournal,
}));
vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'recipe_translations') {
        return { upsert: vi.fn().mockResolvedValue({ error: null }) };
      }
      return {
        insert: () => ({ select: () => ({ single: mocks.insertRecipe }) }),
        select: () => ({
          eq: () => ({
            eq: () => ({ maybeSingle: mocks.findMappedRecipe }),
          }),
        }),
      };
    },
  },
}));

const guestRecipe = {
  id: 'guest-recipe-1',
  title: 'Soup',
  ingredients: [],
  instructions: [],
  servings: 2,
  extraction_status: 'full',
  created_at: '2026-08-13T12:00:00.000Z',
};
const idMap = {
  'guest-recipe-1': '10000000-0000-4000-8000-000000000001',
};

describe('migrateGuestRecipesToSupabase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getGuestRecipes.mockResolvedValue([guestRecipe]);
    mocks.prepareIdMap.mockResolvedValue({ ...idMap });
    mocks.insertRecipe.mockResolvedValue({
      data: { id: idMap['guest-recipe-1'] },
      error: null,
    });
    mocks.findMappedRecipe.mockResolvedValue({
      data: { id: idMap['guest-recipe-1'] },
      error: null,
    });
  });

  it('keeps guest recipes after cloud insertion for dependent migrations', async () => {
    await expect(migrateGuestRecipesToSupabase('user-1')).resolves.toEqual({
      migrated: 1,
      idMap,
    });
    expect(mocks.clearGuestRecipes).not.toHaveBeenCalled();
    expect(mocks.clearJournal).not.toHaveBeenCalled();
  });

  it('resolves the pre-journaled cloud id on retry without losing mapping', async () => {
    mocks.insertRecipe.mockResolvedValue({
      data: null,
      error: { code: '23505' },
    });

    await expect(migrateGuestRecipesToSupabase('user-1')).resolves.toEqual({
      migrated: 0,
      idMap,
    });
    expect(mocks.findMappedRecipe).toHaveBeenCalledOnce();
    expect(mocks.clearGuestRecipes).not.toHaveBeenCalled();
  });

  it('clears recipes before deleting the journal during finalization', async () => {
    mocks.clearGuestRecipes.mockResolvedValue(undefined);
    mocks.clearJournal.mockResolvedValue(undefined);

    await finalizeGuestRecipeMigration('user-1');

    expect(mocks.clearGuestRecipes.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.clearJournal.mock.invocationCallOrder[0],
    );
  });
});
