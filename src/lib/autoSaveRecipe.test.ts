import { beforeEach, describe, expect, it, vi } from 'vitest';

import { autoSaveRecipe } from './autoSaveRecipe';

// vi.mock calls are hoisted above the imports.
const mocks = vi.hoisted(() => ({
  saveRecipeDraft: vi.fn(),
  clearRecipeDraft: vi.fn(),
  captureRecipeSaved: vi.fn(),
}));

vi.mock('@/lib/saveRecipeDraft', () => ({ saveRecipeDraft: mocks.saveRecipeDraft }));
vi.mock('@/lib/recipeDraft', () => ({ clearRecipeDraft: mocks.clearRecipeDraft }));
vi.mock('@/lib/analytics', () => ({ captureRecipeSaved: mocks.captureRecipeSaved }));

const recipe = {
  title: 'Shakshuka',
  servings: 2,
  ingredients: [{ name: 'eggs', quantity: 4, unit: '' }],
  instructions: [{ step: 1, text: 'Cook.' }],
  extraction_status: 'full' as const,
};

describe('autoSaveRecipe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.clearRecipeDraft.mockResolvedValue(undefined);
  });

  it('saves the recipe, clears the draft and counts an automatic save', async () => {
    mocks.saveRecipeDraft.mockResolvedValue({ recipe: { ...recipe, id: 'r-1' }, recoveredDuplicate: false });

    await expect(autoSaveRecipe(recipe)).resolves.toBe('r-1');

    expect(mocks.saveRecipeDraft).toHaveBeenCalledWith(expect.objectContaining({ title: 'Shakshuka', source_language: expect.any(String) }));
    expect(mocks.clearRecipeDraft).toHaveBeenCalled();
    expect(mocks.captureRecipeSaved).toHaveBeenCalledWith({ from: 'extract', save: 'auto' });
  });

  it('opens the one already saved without counting it again', async () => {
    mocks.saveRecipeDraft.mockResolvedValue({ recipe: { ...recipe, id: 'r-0' }, recoveredDuplicate: true });

    await expect(autoSaveRecipe(recipe)).resolves.toBe('r-0');
    expect(mocks.captureRecipeSaved).not.toHaveBeenCalled();
  });

  it('returns null when the save fails, keeping the draft for the preview', async () => {
    mocks.saveRecipeDraft.mockRejectedValue(new Error('offline'));

    await expect(autoSaveRecipe(recipe)).resolves.toBeNull();
    expect(mocks.clearRecipeDraft).not.toHaveBeenCalled();
  });
});
