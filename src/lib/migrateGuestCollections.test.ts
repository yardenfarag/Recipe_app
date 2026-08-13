import { beforeEach, describe, expect, it, vi } from 'vitest';

import { migrateGuestCollectionsToSupabase } from './migrateGuestCollections';

const mocks = vi.hoisted(() => ({
  getGuestCollections: vi.fn(),
  clearGuestCollections: vi.fn(),
  insertCollection: vi.fn(),
  findCollections: vi.fn(),
  upsertMemberships: vi.fn(),
}));

vi.mock('@/lib/guestCollections', () => ({
  getGuestCollections: mocks.getGuestCollections,
  clearGuestCollections: mocks.clearGuestCollections,
}));

vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'collections') {
        return {
          insert: () => ({
            select: () => ({ single: mocks.insertCollection }),
          }),
          select: () => ({ eq: mocks.findCollections }),
        };
      }
      if (table === 'collection_recipes') {
        return { upsert: mocks.upsertMemberships };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  },
}));

describe('migrateGuestCollectionsToSupabase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getGuestCollections.mockResolvedValue([
      {
        id: 'guest-collection-1',
        name: ' Favorites ',
        recipeIds: ['guest-recipe-1', 'cloud-recipe-2'],
        created_at: '2026-08-01T10:00:00.000Z',
      },
    ]);
    mocks.clearGuestCollections.mockResolvedValue(undefined);
    mocks.upsertMemberships.mockResolvedValue({ error: null });
  });

  it('resolves a normalized duplicate and merges memberships before clearing', async () => {
    mocks.insertCollection.mockResolvedValue({
      data: null,
      error: { code: '23505' },
    });
    mocks.findCollections.mockResolvedValue({
      data: [{ id: 'collection-1', name: 'favorites' }],
      error: null,
    });

    await expect(
      migrateGuestCollectionsToSupabase('user-1', {
        'guest-recipe-1': 'cloud-recipe-1',
      }),
    ).resolves.toBe(1);

    expect(mocks.upsertMemberships).toHaveBeenCalledWith(
      [
        { collection_id: 'collection-1', recipe_id: 'cloud-recipe-1' },
        { collection_id: 'collection-1', recipe_id: 'cloud-recipe-2' },
      ],
      { onConflict: 'collection_id,recipe_id', ignoreDuplicates: true },
    );
    expect(mocks.clearGuestCollections).toHaveBeenCalledOnce();
  });

  it('retains guest collections when membership merging fails', async () => {
    mocks.insertCollection.mockResolvedValue({
      data: { id: 'collection-1' },
      error: null,
    });
    mocks.upsertMemberships.mockResolvedValue({
      error: new Error('membership insert failed'),
    });

    await expect(
      migrateGuestCollectionsToSupabase('user-1', {
        'guest-recipe-1': 'cloud-recipe-1',
      }),
    ).rejects.toThrow('membership insert failed');
    expect(mocks.clearGuestCollections).not.toHaveBeenCalled();
  });
});
