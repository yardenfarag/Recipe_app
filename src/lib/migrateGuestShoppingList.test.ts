import { beforeEach, describe, expect, it, vi } from 'vitest';

import { migrateGuestShoppingListToSupabase } from './migrateGuestShoppingList';

const mocks = vi.hoisted(() => ({
  getGuestShoppingList: vi.fn(),
  clearGuestShoppingList: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/lib/guestShoppingList', () => ({
  getGuestShoppingList: mocks.getGuestShoppingList,
  clearGuestShoppingList: mocks.clearGuestShoppingList,
}));

vi.mock('@/lib/supabase/client', () => ({
  supabase: { rpc: mocks.rpc },
}));

const guestItems = [
  {
    id: 'list-1',
    name: 'Milk',
    quantity: 2,
    unit: 'cup',
    checked: true,
    sourceRecipeIds: ['guest-recipe-1'],
    created_at: '2026-08-01T10:00:00.000Z',
    updated_at: '2026-08-01T11:00:00.000Z',
  },
];

describe('migrateGuestShoppingListToSupabase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getGuestShoppingList.mockResolvedValue(guestItems);
    mocks.clearGuestShoppingList.mockResolvedValue(undefined);
  });

  it('uses one transactional RPC and clears local data only after success', async () => {
    mocks.rpc.mockResolvedValue({ data: 1, error: null });

    await expect(
      migrateGuestShoppingListToSupabase('user-1', {
        'guest-recipe-1': 'cloud-recipe-1',
      }),
    ).resolves.toBe(1);

    expect(mocks.rpc).toHaveBeenCalledWith('migrate_guest_shopping_list', {
      p_user_id: 'user-1',
      p_items: [
        expect.objectContaining({
          name: 'Milk',
          checked: true,
          source_recipe_ids: ['cloud-recipe-1'],
        }),
      ],
    });
    expect(mocks.clearGuestShoppingList).toHaveBeenCalledOnce();
  });

  it('keeps local data when the cloud transaction fails', async () => {
    const error = new Error('database unavailable');
    mocks.rpc.mockResolvedValue({ data: null, error });

    await expect(migrateGuestShoppingListToSupabase('user-1')).rejects.toBe(error);
    expect(mocks.clearGuestShoppingList).not.toHaveBeenCalled();
  });

  it('keeps local data if the transaction reports an incomplete batch', async () => {
    mocks.rpc.mockResolvedValue({ data: 0, error: null });

    await expect(migrateGuestShoppingListToSupabase('user-1')).rejects.toThrow(
      'sync was incomplete',
    );
    expect(mocks.clearGuestShoppingList).not.toHaveBeenCalled();
  });
});
