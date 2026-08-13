import { beforeEach, describe, expect, it, vi } from 'vitest';

import { saveRecipeDraft } from './saveRecipeDraft';

const mocks = vi.hoisted(() => ({
  saveRecipe: vi.fn(),
  fetchRecipeByUrl: vi.fn(),
}));

vi.mock('@/lib/supabase/recipes', () => ({
  saveRecipe: mocks.saveRecipe,
  fetchRecipeByUrl: mocks.fetchRecipeByUrl,
}));

const draft = {
  title: 'Soup',
  original_url: 'https://example.com/soup',
  ingredients: [],
  instructions: [],
  servings: 2,
  extraction_status: 'full' as const,
};

const saved = {
  ...draft,
  id: 'recipe-1',
  user_id: 'user-1',
  created_at: '2026-08-13T12:00:00.000Z',
};

describe('saveRecipeDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the normal insert result', async () => {
    mocks.saveRecipe.mockResolvedValue(saved);

    await expect(saveRecipeDraft(draft)).resolves.toEqual({
      recipe: saved,
      recoveredDuplicate: false,
    });
  });

  it('resolves a committed insert after a unique URL retry', async () => {
    mocks.saveRecipe.mockRejectedValue({ code: '23505', message: 'duplicate' });
    mocks.fetchRecipeByUrl.mockResolvedValue(saved);

    await expect(saveRecipeDraft(draft)).resolves.toEqual({
      recipe: saved,
      recoveredDuplicate: true,
    });
    expect(mocks.fetchRecipeByUrl).toHaveBeenCalledWith(draft.original_url);
  });

  it('does not hide an unresolvable duplicate', async () => {
    const duplicate = { code: '23505', message: 'duplicate' };
    mocks.saveRecipe.mockRejectedValue(duplicate);
    mocks.fetchRecipeByUrl.mockResolvedValue(null);

    await expect(saveRecipeDraft(draft)).rejects.toBe(duplicate);
  });
});
