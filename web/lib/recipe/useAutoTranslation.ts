"use client";

import { useEffect, useState } from "react";

import { ensureRecipeTranslation } from "@shared/lib/ensureRecipeTranslation";
import type { Recipe, RecipeTranslationContent } from "@shared/types/recipe";

import { needsTranslation } from "@/lib/recipe/recipeDisplay";

type Result = { recipe: Recipe; language: string; translation: RecipeTranslationContent | null };

/**
 * A recipe that isn't saved yet (the Snap preview) in the app's language, as mobile shows it: translated once when
 * it opens (free, within a daily limit). Nothing is stored; a saved recipe keeps its translations on its own page.
 *
 * `translation` is null when the recipe is already in the app's language, while it translates, or if translating
 * failed; the recipe's own words show then.
 */
export function useAutoTranslation(
  recipe: Recipe | null,
  language: string,
): { translation: RecipeTranslationContent | null; translating: boolean } {
  const [result, setResult] = useState<Result | null>(null);
  const wanted = recipe != null && needsTranslation(recipe, language);

  useEffect(() => {
    if (!recipe || !wanted) return;
    let cancelled = false;
    ensureRecipeTranslation({ recipe, targetLanguage: language, cached: recipe.translations?.[language] ?? null })
      .then((outcome) => (outcome.status === "ok" ? outcome.content : null))
      .catch(() => null)
      .then((translation) => {
        if (!cancelled) setResult({ recipe, language, translation });
      });
    return () => {
      cancelled = true;
    };
  }, [recipe, language, wanted]);

  const current = wanted && result && result.recipe === recipe && result.language === language ? result : null;
  return { translation: current?.translation ?? null, translating: wanted && !current };
}
