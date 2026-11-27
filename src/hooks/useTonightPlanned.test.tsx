/**
 * Tonight's dinner from the plan, when it is past the Library's first page, is read on its own: it must still show in
 * the app language like its card, and follow a language change.
 * React Native Testing Library v14: render and act are async, always await them.
 */
import { act, renderHook } from '@testing-library/react-native';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Recipe } from '@shared/types/recipe';

import { useTonightPlanned } from '@/hooks/useTonightPlanned';

const mocks = vi.hoisted(() => ({
  language: 'he',
  fetchMealPlan: vi.fn(),
  fetchRecipeById: vi.fn(),
  fetchForLanguage: vi.fn(),
}));

vi.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/useLanguagePreference', () => ({ useLanguagePreference: () => ({ language: mocks.language }) }));
vi.mock('@shared/lib/supabase/mealPlan', () => ({ fetchMealPlan: mocks.fetchMealPlan }));
vi.mock('@shared/lib/supabase/recipes', () => ({ fetchRecipeById: mocks.fetchRecipeById }));
vi.mock('@shared/lib/supabase/recipeTranslations', () => ({
  fetchRecipeTranslationsForLanguage: mocks.fetchForLanguage,
}));

const cookies = {
  id: 'r1',
  title: 'White Chocolate Chip Cookies',
  source_language: 'en',
  ingredients: [{ name: 'white chocolate', quantity: 1, unit: 'cup' }],
  instructions: [{ step: 1, text: 'Bake.' }],
} as unknown as Recipe;

const titles: Record<string, string> = { he: 'עוגיות שוקולד לבן', ru: 'Печенье с белым шоколадом' };

const flush = () => act(async () => {});

describe('useTonightPlanned', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.language = 'he';
    mocks.fetchMealPlan.mockResolvedValue([{ meal: 'dinner', recipeId: 'r1', leftoverOf: null, cookedAt: null }]);
    mocks.fetchRecipeById.mockResolvedValue(cookies);
    mocks.fetchForLanguage.mockImplementation(async (language: string) =>
      titles[language] ? { r1: { title: titles[language], ingredients: [], instructions: [] } } : {},
    );
  });

  it('shows a planned recipe that is not loaded yet in the app language', async () => {
    const { result } = await renderHook(() => useTonightPlanned([]));
    await flush();
    expect(result.current?.display_title).toBe('עוגיות שוקולד לבן');
  });

  it('reads it again in the new language after a language change', async () => {
    const { result, rerender } = await renderHook(() => useTonightPlanned([]));
    await flush();
    mocks.language = 'ru';
    await rerender({});
    await flush();
    expect(mocks.fetchForLanguage).toHaveBeenLastCalledWith('ru', ['r1']);
    expect(result.current?.display_title).toBe('Печенье с белым шоколадом');
  });

  it('keeps its own title when it has no translation into the app language, as its card does', async () => {
    mocks.language = 'es';
    const { result } = await renderHook(() => useTonightPlanned([]));
    await flush();
    expect(result.current?.display_title).toBe('White Chocolate Chip Cookies');
  });

  it('uses the Library copy when the recipe is loaded', async () => {
    const card = { ...cookies, display_title: 'עוגיות שוקולד לבן' };
    const { result } = await renderHook(() => useTonightPlanned([card]));
    await flush();
    expect(result.current).toBe(card);
    expect(mocks.fetchRecipeById).not.toHaveBeenCalled();
  });
});
