import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useLanguagePreference } from '@/hooks/useLanguagePreference';
import { ensureRecipeTranslation } from '@/lib/ensureRecipeTranslation';
import {
  getGuestRecipeTranslation,
  upsertGuestRecipeTranslation,
} from '@/lib/guestRecipes';
import { isRecipeLanguageCode, type RecipeLanguageCode } from '@/lib/recipeLanguages';
import { resolveRecipeSourceLanguage } from '@/lib/recipeSourceLanguage';
import {
  fetchRecipeTranslation,
  upsertRecipeTranslation,
} from '@/lib/supabase/recipeTranslations';
import type { ExtractedRecipe } from '@/lib/supabase/extractRecipe';
import type { RecipeTranslationContent } from '@/types/recipe';

type LocalizedState = {
  display: RecipeTranslationContent;
  activeLanguage: RecipeLanguageCode | null;
  translating: boolean;
  error: string | null;
};

/**
 * Resolves preferred-language overlay for a recipe (cache → translate → persist).
 * Canonical recipe fields stay untouched; callers persist overlays separately.
 */
export function useLocalizedRecipe(recipe: ExtractedRecipe | null | undefined, recipeId?: string) {
  const { t } = useTranslation();
  const { language: preferredLanguage, ready } = useLanguagePreference();
  // Include ingredient/instruction content so swaps & remixes refresh overlays
  // (length alone misses same-count edits that change step text).
  const recipeKey = recipe
    ? `${recipeId ?? 'draft'}:${preferredLanguage}:${recipe.title}:${recipe.servings}:${JSON.stringify(recipe.ingredients)}:${JSON.stringify(recipe.instructions)}`
    : '';
  const [state, setState] = useState<LocalizedState | null>(null);
  const runId = useRef(0);
  // Keep latest recipe for the effect without re-running on parent identity churn
  // (preview/detail often clone the recipe on every content echo).
  const recipeRef = useRef(recipe);
  recipeRef.current = recipe;

  const persistTranslation = useCallback(
    async (language: string, content: RecipeTranslationContent) => {
      if (!recipeId) return;
      if (recipeId.startsWith('guest-')) {
        await upsertGuestRecipeTranslation(recipeId, language, content);
      } else {
        await upsertRecipeTranslation(recipeId, language, content);
      }
    },
    [recipeId],
  );

  const loadCached = useCallback(
    async (language: string): Promise<RecipeTranslationContent | null> => {
      const current = recipeRef.current;
      if (!recipeId) {
        return current?.translations?.[language] ?? null;
      }
      if (recipeId.startsWith('guest-')) {
        return getGuestRecipeTranslation(recipeId, language);
      }
      return fetchRecipeTranslation(recipeId, language);
    },
    [recipeId],
  );

  useEffect(() => {
    const current = recipeRef.current;
    if (!current || !ready) {
      setState(null);
      return;
    }

    const source = resolveRecipeSourceLanguage(current);
    const canonical: RecipeTranslationContent = {
      title: current.title,
      ingredients: current.ingredients,
      instructions: current.instructions,
    };

    if (preferredLanguage === source) {
      setState({
        display: canonical,
        activeLanguage: null,
        translating: false,
        error: null,
      });
      return;
    }

    const id = ++runId.current;
    setState({
      display: canonical,
      activeLanguage: null,
      translating: true,
      error: null,
    });

    void (async () => {
      try {
        const cached = await loadCached(preferredLanguage);
        const result = await ensureRecipeTranslation({
          recipe: {
            title: current.title,
            ingredients: current.ingredients,
            instructions: current.instructions,
            source_language: current.source_language,
          },
          targetLanguage: preferredLanguage,
          cached,
        });

        if (id !== runId.current) return;

        if (result.status === 'failed') {
          setState({
            display: canonical,
            activeLanguage: null,
            translating: false,
            error:
              result.code === 'daily_limit'
                ? t('recipe.translateDailyLimit')
                : result.message,
          });
          return;
        }

        let persistenceError: string | null = null;
        if (result.status === 'ok' && !result.fromCache) {
          try {
            await persistTranslation(preferredLanguage, result.content);
          } catch (error) {
            persistenceError =
              error instanceof Error ? error.message : t('recipe.translationSaveFailed');
          }
        }

        const active =
          result.status === 'ok' && isRecipeLanguageCode(preferredLanguage)
            ? preferredLanguage
            : null;

        setState({
          display: result.content,
          activeLanguage: active,
          translating: false,
          error: persistenceError,
        });
      } catch (err) {
        if (id !== runId.current) return;
        setState({
          display: canonical,
          activeLanguage: null,
          translating: false,
          error: err instanceof Error ? err.message : t('recipe.translateFailedTitle'),
        });
      }
    })();
  }, [recipeKey, ready, preferredLanguage, loadCached, persistTranslation, t]);

  const applyManualTranslation = useCallback(
    async (language: RecipeLanguageCode, content: RecipeTranslationContent) => {
      await persistTranslation(language, content);
      setState((prev) =>
        prev
          ? {
              ...prev,
              display: content,
              activeLanguage: language,
              translating: false,
              error: null,
            }
          : {
              display: content,
              activeLanguage: language,
              translating: false,
              error: null,
            },
      );
    },
    [persistTranslation],
  );

  const showOriginal = useCallback(() => {
    const current = recipeRef.current;
    if (!current) return;
    setState({
      display: {
        title: current.title,
        ingredients: current.ingredients,
        instructions: current.instructions,
      },
      activeLanguage: null,
      translating: false,
      error: null,
    });
  }, []);

  return {
    preferredLanguage,
    displayContent: state?.display ?? null,
    activeLanguage: state?.activeLanguage ?? null,
    translating: state?.translating ?? false,
    translationError: state?.error ?? null,
    applyManualTranslation,
    showOriginal,
    persistTranslation,
    loadCached,
  };
}
