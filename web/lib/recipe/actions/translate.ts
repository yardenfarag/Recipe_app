import { ensureRecipeTranslation } from "@shared/lib/ensureRecipeTranslation";
import type { RecipeLanguageCode } from "@shared/lib/recipeLanguages";
import { serverErrorText, TRANSLATE_ERROR_KEYS } from "@shared/lib/serverErrors";
import { fetchRecipeTranslation, upsertRecipeTranslation } from "@shared/lib/supabase/recipeTranslations";
import type { Recipe, RecipeTranslationContent } from "@shared/types/recipe";

export type TranslateOutcome =
  /** The recipe is already written in that language: show its own words. */
  | { status: "source" }
  | { status: "ok"; content: RecipeTranslationContent }
  /** `save_failed`: translated, but the copy couldn't be stored, so it isn't shown (as on mobile). */
  | { status: "failed"; code?: string; message?: string };

/**
 * Translate (ADR 012), as the mobile translate sheet does it: a stored translation first, else `translate-recipe`
 * from the recipe's own text (free, within a daily limit), then stored so opening it again costs nothing.
 */
export async function translateRecipeTo(recipe: Recipe, language: RecipeLanguageCode): Promise<TranslateOutcome> {
  let cached: RecipeTranslationContent | null = recipe.translations?.[language] ?? null;
  if (!cached) {
    try {
      cached = await fetchRecipeTranslation(recipe.id, language);
    } catch {
      cached = null; // Translate instead.
    }
  }

  const result = await ensureRecipeTranslation({ recipe, targetLanguage: language, cached });
  if (result.status === "source") return { status: "source" };
  if (result.status === "failed") return { status: "failed", code: result.code, message: result.message };

  if (!result.fromCache) {
    try {
      await upsertRecipeTranslation(recipe.id, language, result.content);
    } catch {
      return { status: "failed", code: "save_failed" };
    }
  }
  return { status: "ok", content: result.content };
}

/**
 * The message for a failed translation, in `language` (the app's): a save that failed, the server's code in the
 * app's words (the daily limit, a timeout…), or the general one (PIN-158).
 */
export function translateFailure(
  outcome: Extract<TranslateOutcome, { status: "failed" }>,
  t: (key: string) => string,
  language: string,
): string {
  if (outcome.code === "save_failed") return t("recipe.translationSaveFailed");
  return serverErrorText(outcome, t, language, "web.recipeActions.translateFailed", TRANSLATE_ERROR_KEYS);
}
