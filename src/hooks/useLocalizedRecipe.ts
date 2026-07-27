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
  const recipeKey = recipe
    ? `${recipeId ?? 'draft'}:${recipe.title}:${recipe.ingredients.length}:${preferredLanguage}`
    : '';
  const [state, setState] = useState<LocalizedState | null>(null);
  const runId = useRef(0);

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
      if (!recipeId) {
        return recipe?.translations?.[language] ?? null;
      }
      if (recipeId.startsWith('guest-')) {
        return getGuestRecipeTranslation(recipeId, language);
      }
      return fetchRecipeTranslation(recipeId, language);
    },
    [recipeId, recipe?.translations],
  );

  useEffect(() => {
    if (!recipe || !ready) {
      setState(null);
      return;
    }

    const source = effectiveSourceLanguage(recipe.source_language);
    const canonical: RecipeTranslationContent = {
      title: recipe.title,
      ingredients: recipe.ingredients,
      instructions: recipe.instructions,
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
            title: recipe.title,
            ingredients: recipe.ingredients,
            instructions: recipe.instructions,
            source_language: recipe.source_language,
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
  }, [recipeKey, ready, preferredLanguage, loadCached, persistTranslation, recipe]);

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
    if (!recipe) return;
    setState({
      display: {
        title: recipe.title,
        ingredients: recipe.ingredients,
        instructions: recipe.instructions,
      },
      activeLanguage: null,
      translating: false,
      error: null,
    });
  }, [recipe]);

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
