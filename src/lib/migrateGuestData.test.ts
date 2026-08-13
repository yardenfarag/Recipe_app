import { beforeEach, describe, expect, it, vi } from 'vitest';

import { migrateGuestDataToSupabase } from './migrateGuestData';

const mocks = vi.hoisted(() => ({
  recipes: vi.fn(),
  collections: vi.fn(),
  shoppingList: vi.fn(),
  finalize: vi.fn(),
}));

vi.mock('@/lib/migrateGuestRecipes', () => ({
  migrateGuestRecipesToSupabase: mocks.recipes,
  finalizeGuestRecipeMigration: mocks.finalize,
}));
vi.mock('@/lib/migrateGuestCollections', () => ({
  migrateGuestCollectionsToSupabase: mocks.collections,
}));
vi.mock('@/lib/migrateGuestShoppingList', () => ({
  migrateGuestShoppingListToSupabase: mocks.shoppingList,
}));

describe('migrateGuestDataToSupabase', () => {
  const idMap = { 'guest-recipe-1': 'cloud-recipe-1' };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.recipes.mockResolvedValue({ migrated: 1, idMap });
    mocks.collections.mockResolvedValue(1);
    mocks.shoppingList.mockResolvedValue(1);
    mocks.finalize.mockResolvedValue(undefined);
  });

  it('keeps recipe source data when a dependent migration fails', async () => {
    mocks.collections.mockRejectedValueOnce(new Error('collections unavailable'));

    await expect(migrateGuestDataToSupabase('user-1')).rejects.toThrow(
      'collections unavailable',
    );
    expect(mocks.finalize).not.toHaveBeenCalled();
  });

  it('reuses the journaled mapping on retry and finalizes only after dependents', async () => {
    mocks.shoppingList.mockRejectedValueOnce(new Error('shopping unavailable'));
    await expect(migrateGuestDataToSupabase('user-1')).rejects.toThrow(
      'shopping unavailable',
    );
    expect(mocks.finalize).not.toHaveBeenCalled();

    await expect(migrateGuestDataToSupabase('user-1')).resolves.toBeUndefined();
    expect(mocks.collections).toHaveBeenLastCalledWith('user-1', idMap);
    expect(mocks.shoppingList).toHaveBeenLastCalledWith('user-1', idMap);
    expect(mocks.finalize).toHaveBeenCalledWith('user-1');
    expect(mocks.finalize.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.shoppingList.mock.invocationCallOrder.at(-1)!,
    );
  });
});
