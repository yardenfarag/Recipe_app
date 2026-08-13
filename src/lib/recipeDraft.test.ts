import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => {
  const values = new Map<string, string>();
  return {
    values,
    getItem: vi.fn(async (key: string) => values.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      values.delete(key);
    }),
  };
});

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: storage,
}));

const recipe = {
  title: 'Stored soup',
  ingredients: [{ name: 'Water', quantity: 1, unit: 'cup' }],
  instructions: [{ step: 1, text: 'Simmer.' }],
  servings: 2,
  extraction_status: 'full' as const,
};

describe('recipe draft persistence', () => {
  beforeEach(() => {
    storage.values.clear();
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('restores a paid extraction after module memory is lost', async () => {
    const firstLoad = await import('./recipeDraft');
    await firstLoad.setRecipeDraft(recipe);

    vi.resetModules();
    const afterRestart = await import('./recipeDraft');
    await expect(afterRestart.getRecipeDraft()).resolves.toEqual(recipe);
  });

  it('removes both memory and persisted data on clear', async () => {
    const drafts = await import('./recipeDraft');
    await drafts.setRecipeDraft(recipe);
    await drafts.clearRecipeDraft();

    expect(drafts.peekRecipeDraft()).toBeNull();
    await expect(drafts.getRecipeDraft()).resolves.toBeNull();
    expect(storage.removeItem).toHaveBeenCalledWith('pinch:recipe-draft');
  });

  it('ignores malformed persisted data', async () => {
    storage.values.set('pinch:recipe-draft', '{"title":"incomplete"}');
    const drafts = await import('./recipeDraft');

    await expect(drafts.getRecipeDraft()).resolves.toBeNull();
  });

  it('acknowledges the charge id only after the draft write succeeds', async () => {
    const requests = await import('./extractionRequestId');
    const drafts = await import('./recipeDraft');
    const url = 'https://example.com/paid-recipe';
    const requestId = await requests.getOrCreateExtractionRequestId(url);

    await drafts.setRecipeDraft(recipe, { url, requestId });

    const writes = storage.setItem.mock.calls.map(([key]) => key);
    expect(writes).toEqual([
      '@pinch/pending-extraction-request-ids',
      'pinch:recipe-draft',
      '@pinch/pending-extraction-request-ids',
    ]);

    vi.resetModules();
    const restartedRequests = await import('./extractionRequestId');
    const nextRequestId = await restartedRequests.getOrCreateExtractionRequestId(url);
    expect(nextRequestId).not.toBe(requestId);
  });
});
