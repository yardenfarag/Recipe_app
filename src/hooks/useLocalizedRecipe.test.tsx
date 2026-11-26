/**
 * Opening a recipe written in another language than the app's waits for the translation instead of showing the
 * recipe's own words first; translating again later (a swap, a remix) keeps the recipe on screen.
 * React Native Testing Library v14: render and act are async, always await them.
 */
import { act, renderHook } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useLocalizedRecipe } from '@/hooks/useLocalizedRecipe';
import type { ExtractedRecipe } from '@/lib/supabase/extractRecipe';

const mocks = vi.hoisted(() => ({
  ensure: vi.fn(),
  fetchCached: vi.fn(),
  upsert: vi.fn(),
  // One function for every render, as i18next gives: the hook's effect depends on it.
  t: (key: string) => key,
}));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: mocks.t }) }));
vi.mock('@/hooks/useLanguagePreference', () => ({ useLanguagePreference: () => ({ language: 'en', ready: true }) }));
vi.mock('@/lib/ensureRecipeTranslation', () => ({ ensureRecipeTranslation: mocks.ensure }));
vi.mock('@shared/lib/supabase/recipeTranslations', () => ({
  fetchRecipeTranslation: mocks.fetchCached,
  upsertRecipeTranslation: mocks.upsert,
}));
vi.mock('@/lib/guestRecipes', () => ({ getGuestRecipeTranslation: vi.fn(), upsertGuestRecipeTranslation: vi.fn() }));

const hebrew = {
  title: 'שקשוקה',
  source_language: 'he',
  servings: 2,
  ingredients: [{ name: 'ביצים', quantity: 4, unit: '' }],
  instructions: [{ step: 1, text: 'מחממים שמן.' }],
} as unknown as ExtractedRecipe;

const english = {
  title: 'Shakshuka',
  ingredients: [{ name: 'eggs', quantity: 4, unit: '' }],
  instructions: [{ step: 1, text: 'Heat the oil.' }],
};

/** A translation the test finishes by hand. */
function pendingTranslation() {
  let finish: (value: unknown) => void = () => undefined;
  mocks.ensure.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
  return (value: unknown) => act(async () => finish(value));
}

describe('useLocalizedRecipe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchCached.mockResolvedValue(null);
    mocks.upsert.mockResolvedValue(undefined);
  });

  it('waits while a recipe in another language is first translated, then shows the translation', async () => {
    const finish = pendingTranslation();
    const { result } = await renderHook(() => useLocalizedRecipe(hebrew, 'r1'));
    expect(result.current.waitingForTranslation).toBe(true);

    await finish({ status: 'ok', content: english, fromCache: false });
    expect(result.current.waitingForTranslation).toBe(false);
    expect(result.current.displayContent?.title).toBe('Shakshuka');
    expect(result.current.activeLanguage).toBe('en');
    expect(mocks.upsert).toHaveBeenCalledWith('r1', 'en', english);
  });

  it("doesn't wait for a recipe already in the app's language", async () => {
    const recipe = { ...hebrew, ...english, source_language: 'en' } as ExtractedRecipe;
    const { result } = await renderHook(() => useLocalizedRecipe(recipe, 'r1'));
    expect(result.current.waitingForTranslation).toBe(false);
    expect(mocks.ensure).not.toHaveBeenCalled();
  });

  it("stops waiting and shows the recipe's own words when translating fails", async () => {
    const finish = pendingTranslation();
    const { result } = await renderHook(() => useLocalizedRecipe(hebrew, 'r1'));
    await finish({ status: 'failed', message: 'Translation timed out.', code: 'translation_timeout' });
    expect(result.current.waitingForTranslation).toBe(false);
    expect(result.current.displayContent?.title).toBe('שקשוקה');
    expect(result.current.translationError).not.toBeNull();
  });

  it('translates a changed recipe again without hiding it', async () => {
    mocks.ensure.mockResolvedValueOnce({ status: 'ok', content: english, fromCache: false });
    const { result, rerender } = await renderHook(
      ({ recipe }: { recipe: ExtractedRecipe }) => useLocalizedRecipe(recipe, 'r1'),
      { initialProps: { recipe: hebrew } },
    );
    await vi.waitFor(() => expect(result.current.waitingForTranslation).toBe(false));

    const finish = pendingTranslation();
    const swapped = { ...hebrew, ingredients: [{ name: 'ביצי שליו', quantity: 4, unit: '' }] } as ExtractedRecipe;
    await rerender({ recipe: swapped });
    expect(result.current.translating).toBe(true);
    expect(result.current.waitingForTranslation).toBe(false);
    await finish({ status: 'ok', content: english, fromCache: false });
    expect(result.current.translating).toBe(false);
  });
});
