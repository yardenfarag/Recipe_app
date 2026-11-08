import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ParsedRecipeBackup } from '@/lib/recipeBackup';
import type { Recipe } from '@/types/recipe';

import { restoreRecipeBackup } from './recipeBackup';

const mocks = vi.hoisted(() => ({
  fetchRecipesPage: vi.fn(),
  fetchRecipeByUrl: vi.fn(),
  insertRecipe: vi.fn(),
  upsertTranslations: vi.fn(),
  listCollections: vi.fn(),
  insertCollection: vi.fn(),
  upsertMemberships: vi.fn(),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({ default: {} }));

vi.mock('@/lib/supabase/recipes', () => ({
  fetchRecipesPage: mocks.fetchRecipesPage,
  fetchRecipeByUrl: mocks.fetchRecipeByUrl,
}));

vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
    from: (table: string) => {
      if (table === 'recipes') {
        return {
          insert: (row: unknown) => ({ select: () => ({ single: () => mocks.insertRecipe(row) }) }),
        };
      }
      if (table === 'recipe_translations') return { upsert: mocks.upsertTranslations };
      if (table === 'collections') {
        return {
          select: () => ({ eq: mocks.listCollections }),
          insert: (row: unknown) => ({
            select: () => ({ single: () => mocks.insertCollection(row) }),
          }),
        };
      }
      if (table === 'collection_recipes') return { upsert: mocks.upsertMemberships };
      throw new Error(`Unexpected table: ${table}`);
    },
  },
}));

function recipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: 'b1',
    title: 'Shakshuka',
    servings: 2,
    extraction_status: 'full',
    ingredients: [{ name: 'Eggs', quantity: 4, unit: '' }],
    instructions: [{ step: 1, text: 'Crack the eggs into the sauce.' }],
    ...overrides,
  };
}

describe('restoreRecipeBackup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.upsertTranslations.mockResolvedValue({ error: null });
    mocks.upsertMemberships.mockResolvedValue({ error: null });
    mocks.listCollections.mockResolvedValue({ data: [{ id: 'col-1', name: 'brunch' }], error: null });
    mocks.insertCollection.mockResolvedValue({ data: { id: 'col-2' }, error: null });
    let next = 0;
    mocks.insertRecipe.mockImplementation(async () => ({
      data: { id: `new-${++next}` },
      error: null,
    }));
  });

  it('adds only new recipes, keeps their content, and links collections to library ids', async () => {
    mocks.fetchRecipesPage.mockResolvedValue({
      recipes: [recipe({ id: 'lib-1', user_id: 'user-1' })],
      total: 1,
    });
    const backup: ParsedRecipeBackup = {
      recipes: [
        recipe({ id: 'b1' }),
        recipe({
          id: 'b2',
          title: 'Pancakes',
          user_id: 'someone-else',
          tags: ['breakfast'],
          is_favorite: true,
          created_at: '2025-01-01T00:00:00.000Z',
          translations: { he: { title: 'פנקייק', ingredients: [], instructions: [] } },
        }),
        recipe({ id: 'b3', title: 'Pancakes', user_id: 'someone-else' }),
      ],
      collections: [
        { name: 'Brunch', recipe_ids: ['b1', 'b2', 'b3'] },
        { name: 'Sweet', recipe_ids: ['b2'] },
      ],
      invalid: 1,
    };

    await expect(restoreRecipeBackup(backup)).resolves.toEqual({
      added: 1,
      skipped: 2,
      invalid: 1,
      collectionsCreated: 1,
    });

    expect(mocks.insertRecipe).toHaveBeenCalledOnce();
    const row = mocks.insertRecipe.mock.calls[0][0];
    expect(row).toMatchObject({
      user_id: 'user-1',
      title: 'Pancakes',
      tags: ['breakfast'],
      is_favorite: true,
      created_at: '2025-01-01T00:00:00.000Z',
    });
    expect(row).not.toHaveProperty('id');
    expect(row).not.toHaveProperty('translations');

    expect(mocks.upsertTranslations).toHaveBeenCalledWith(
      [{ recipe_id: 'new-1', language_code: 'he', title: 'פנקייק', ingredients: [], instructions: [] }],
      { onConflict: 'recipe_id,language_code' },
    );
    expect(mocks.insertCollection).toHaveBeenCalledWith({ user_id: 'user-1', name: 'Sweet' });
    expect(mocks.upsertMemberships).toHaveBeenNthCalledWith(
      1,
      [
        { collection_id: 'col-1', recipe_id: 'lib-1' },
        { collection_id: 'col-1', recipe_id: 'new-1' },
      ],
      { onConflict: 'collection_id,recipe_id', ignoreDuplicates: true },
    );
    expect(mocks.upsertMemberships).toHaveBeenNthCalledWith(
      2,
      [{ collection_id: 'col-2', recipe_id: 'new-1' }],
      { onConflict: 'collection_id,recipe_id', ignoreDuplicates: true },
    );
  });

  it('treats a URL the database already has as skipped and still links it', async () => {
    mocks.fetchRecipesPage.mockResolvedValue({ recipes: [], total: 0 });
    mocks.insertRecipe.mockResolvedValue({ data: null, error: { code: '23505' } });
    mocks.fetchRecipeByUrl.mockResolvedValue(recipe({ id: 'lib-9' }));

    await expect(
      restoreRecipeBackup({
        recipes: [recipe({ original_url: 'https://example.com/shakshuka' })],
        collections: [{ name: 'Brunch', recipe_ids: ['b1'] }],
        invalid: 0,
      }),
    ).resolves.toMatchObject({ added: 0, skipped: 1 });

    expect(mocks.fetchRecipeByUrl).toHaveBeenCalledWith('https://example.com/shakshuka', 'extracted');
    expect(mocks.upsertMemberships).toHaveBeenCalledWith(
      [{ collection_id: 'col-1', recipe_id: 'lib-9' }],
      expect.anything(),
    );
  });

  it('restores a written recipe with its locked fields and nothing recalculating', async () => {
    mocks.fetchRecipesPage.mockResolvedValue({ recipes: [], total: 0 });
    const written = recipe({
      title: "Grandma's soup",
      extraction_source: 'manual',
      platform: 'unknown',
      calories: 900,
      locked_fields: ['calories'],
      recalc_pending: ['tags'],
      recalc_started_at: '2026-11-08T12:00:00.000Z',
    });

    await expect(
      restoreRecipeBackup({ recipes: [written], collections: [], invalid: 0 }),
    ).resolves.toMatchObject({ added: 1, skipped: 0 });

    const row = mocks.insertRecipe.mock.calls[0][0];
    expect(row).toMatchObject({
      title: "Grandma's soup",
      extraction_source: 'manual',
      platform: 'unknown',
      calories: 900,
      locked_fields: ['calories'],
    });
    expect(row).not.toHaveProperty('original_url');
    expect(row).not.toHaveProperty('recalc_pending');
    expect(row).not.toHaveProperty('recalc_started_at');
  });

  it('skips a written recipe already in the library by its title and ingredients', async () => {
    mocks.fetchRecipesPage.mockResolvedValue({
      recipes: [recipe({ id: 'lib-1', extraction_source: 'manual' })],
      total: 1,
    });

    await expect(
      restoreRecipeBackup({
        recipes: [recipe({ id: 'b1', extraction_source: 'manual' })],
        collections: [{ name: 'Brunch', recipe_ids: ['b1'] }],
        invalid: 0,
      }),
    ).resolves.toMatchObject({ added: 0, skipped: 1 });
    expect(mocks.insertRecipe).not.toHaveBeenCalled();
    expect(mocks.upsertMemberships).toHaveBeenCalledWith(
      [{ collection_id: 'col-1', recipe_id: 'lib-1' }],
      expect.anything(),
    );
  });

  it('stops on an unexpected insert error so the restore can be re-run', async () => {
    mocks.fetchRecipesPage.mockResolvedValue({ recipes: [], total: 0 });
    mocks.insertRecipe.mockResolvedValue({ data: null, error: new Error('network down') });

    await expect(
      restoreRecipeBackup({ recipes: [recipe()], collections: [], invalid: 0 }),
    ).rejects.toThrow('network down');
    expect(mocks.upsertMemberships).not.toHaveBeenCalled();
  });
});
