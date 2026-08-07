import { useCallback, useEffect, useRef, useState } from 'react';

import { useLanguagePreference } from '@/hooks/useLanguagePreference';
import { effectiveSourceLanguage } from '@/lib/appLanguages';
import { ensureRecipeTranslation } from '@/lib/ensureRecipeTranslation';
import {
  getGuestRecipeTranslation,
  upsertGuestRecipeTranslation,
} from '@/lib/guestRecipes';
import { isRecipeLanguageCode, type RecipeLanguageCode } from '@/lib/recipeLanguages';
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

    const source = effectiveSourceLanguage(current.source_language);
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
            error: result.message,
          });
          return;
        }

        if (result.status === 'ok' && !result.fromCache) {
          try {
            await persistTranslation(preferredLanguage, result.content);
          } catch {
            // Display still works without cache.
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
          error: null,
        });
      } catch (err) {
        if (id !== runId.current) return;
        setState({
          display: canonical,
          activeLanguage: null,
          translating: false,
          error: err instanceof Error ? err.message : "Couldn't translate this recipe.",
        });
      }
    })();
  }, [recipeKey, ready, preferredLanguage, loadCached, persistTranslation]);

  const applyManualTranslation = useCallback(
    async (language: RecipeLanguageCode, content: RecipeTranslationContent) => {
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
      try {
        await persistTranslation(language, content);
      } catch {
        // Non-fatal.
      }
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
