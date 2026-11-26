"use client";

import { useEffect, useState } from "react";

import { ensureRecipeTranslation } from "@shared/lib/ensureRecipeTranslation";
import type { Recipe, RecipeTranslationContent } from "@shared/types/recipe";

import { needsTranslation } from "@/lib/recipe/recipeDisplay";

/** Why a translation didn't happen: the server's code (the daily limit, a timeout…) and message, when it gave one. */
export type AutoTranslationFailure = { code?: string; message?: string };

type Result = {
  recipe: Recipe;
  language: string;
  translation: RecipeTranslationContent | null;
  failure: AutoTranslationFailure | null;
};

/**
 * A recipe that isn't saved yet (the Snap preview) in the app's language, as mobile shows it: translated once when
 * it opens (free, within a daily limit). Nothing is stored here; the preview stores it with the recipe on Save.
 *
 * `translation` is null when the recipe is already in the app's language, while it translates, or if translating
 * failed (`failure` then says why); the recipe's own words show then.
 */
export function useAutoTranslation(
  recipe: Recipe | null,
  language: string,
): { translation: RecipeTranslationContent | null; translating: boolean; failure: AutoTranslationFailure | null } {
  const [result, setResult] = useState<Result | null>(null);
  const wanted = recipe != null && needsTranslation(recipe, language);

  useEffect(() => {
    if (!recipe || !wanted) return;
    let cancelled = false;
    ensureRecipeTranslation({ recipe, targetLanguage: language, cached: recipe.translations?.[language] ?? null })
      .then(
        (outcome): Omit<Result, "recipe" | "language"> =>
          outcome.status === "ok"
            ? { translation: outcome.content, failure: null }
            : outcome.status === "failed"
              ? { translation: null, failure: { code: outcome.code, message: outcome.message } }
              : { translation: null, failure: null },
      )
      .catch(() => ({ translation: null, failure: {} }))
      .then((done) => {
        if (!cancelled) setResult({ recipe, language, ...done });
      });
    return () => {
      cancelled = true;
    };
  }, [recipe, language, wanted]);

  const current = wanted && result && result.recipe === recipe && result.language === language ? result : null;
  return { translation: current?.translation ?? null, translating: wanted && !current, failure: current?.failure ?? null };
}
