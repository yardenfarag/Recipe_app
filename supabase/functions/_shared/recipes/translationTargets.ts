/**
 * What the background translations (PIN-77) share: which app languages a recipe still needs, its text in the shape
 * the translator takes, and when two copies are the same text, so one's translations can serve the other. Used by
 * extract-recipe's step after an extraction (enrich/recipeTranslationsOnSave.ts) and by backfill-translations.
 */

import { parseIngredientAmount } from './ingredientAmounts.ts';
import { resolveRecipeSourceLanguage } from './recipeSourceLanguage.ts';
import {
  recipeAlreadyInLanguage,
  type TranslatedRecipe,
  type TranslateLanguageCode,
  type TranslateRecipeInput,
} from './translateRecipe.ts';

/** The languages the apps are in (shared/lib/appLanguages.ts), and so every recipe is translated into. */
export const APP_LANGUAGES = ['en', 'he', 'ar', 'ru', 'es'] as const satisfies readonly TranslateLanguageCode[];
export type AppLanguage = (typeof APP_LANGUAGES)[number];

export function isAppLanguage(value: string): value is AppLanguage {
  return (APP_LANGUAGES as readonly string[]).includes(value);
}

/** A recipe's text as stored (a `recipes` row, a Hub card, an extraction's answer). */
export type StoredRecipeText = {
  title: unknown;
  ingredients: unknown;
  instructions: unknown;
  source_language?: unknown;
};

export type TranslationSource = Omit<TranslateRecipeInput, 'targetLanguage'>;
export type TranslationContent = Pick<TranslatedRecipe, 'title' | 'ingredients' | 'instructions'>;

/**
 * The text to translate, cleaned the way translate-recipe's request is: named ingredients with a number, steps with
 * text. Null when there is nothing to translate (no title, or no ingredient and no step).
 */
export function translationSourceFrom(recipe: StoredRecipeText | null | undefined): TranslationSource | null {
  if (!recipe || typeof recipe.title !== 'string' || !recipe.title.trim()) return null;
  const ingredients = (Array.isArray(recipe.ingredients) ? recipe.ingredients : [])
    .filter((i): i is Record<string, unknown> => Boolean(i) && typeof i === 'object')
    .filter((i) => typeof i.name === 'string' && i.name.trim() && Number.isFinite(Number(i.quantity)))
    .map((i) => {
      const metric = parseIngredientAmount(i.metric);
      const spoons = parseIngredientAmount(i.spoons);
      return {
        name: String(i.name).trim(),
        quantity: Number(i.quantity),
        unit: typeof i.unit === 'string' ? i.unit.trim() : '',
        ...(metric ? { metric } : {}),
        ...(spoons ? { spoons } : {}),
      };
    });
  const instructions = (Array.isArray(recipe.instructions) ? recipe.instructions : [])
    .filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === 'object')
    .filter((s) => Number.isInteger(s.step) && typeof s.text === 'string' && s.text.trim())
    .map((s) => ({
      step: Number(s.step),
      text: String(s.text).trim(),
      ...(Number.isFinite(s.timestamp_seconds)
        ? { timestamp_seconds: Math.max(0, Math.round(Number(s.timestamp_seconds))) }
        : {}),
    }));
  if (ingredients.length === 0 && instructions.length === 0) return null;
  return { title: recipe.title.trim(), ingredients, instructions };
}

/** The language the recipe is written in, as the apps read it (they show that one as written). */
export function sourceLanguageOf(recipe: StoredRecipeText, source: TranslationSource): string {
  return resolveRecipeSourceLanguage({
    ...source,
    source_language: typeof recipe.source_language === 'string' ? recipe.source_language : null,
  });
}

/** The app languages still to make: all but the recipe's own and those it has. */
export function languagesToTranslate(sourceLanguage: string, have: Iterable<string>): AppLanguage[] {
  const done = new Set(have);
  return APP_LANGUAGES.filter((language) => language !== sourceLanguage && !done.has(language));
}

const trim = (value: string) => value.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '');
const text = (value: unknown) => (typeof value === 'string' ? trim(value) : '');

/** The lines recipe_content_key (SQL) reads: the title, each named ingredient with its amount and unit, each step. */
function contentLines(recipe: StoredRecipeText): string[] | null {
  const title = text(recipe.title).toLowerCase();
  const items = (Array.isArray(recipe.ingredients) ? recipe.ingredients : [])
    .filter((i): i is Record<string, unknown> => Boolean(i) && typeof i === 'object' && !Array.isArray(i))
    .filter((i) => text(i.name) !== '')
    .map((i) => `${text(i.name).toLowerCase()}\x1f${i.quantity == null ? '' : String(i.quantity)}\x1f${text(i.unit).toLowerCase()}`);
  const steps = (Array.isArray(recipe.instructions) ? recipe.instructions : [])
    .filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === 'object' && !Array.isArray(s))
    .map((s) => text(s.text).toLowerCase())
    .filter(Boolean);
  if (!title || (items.length === 0 && steps.length === 0)) return null;
  return [title, items.join('\n'), steps.join('\n')];
}

/**
 * Whether a translation of one is a translation of the other: the same title, ingredients (name, amount, unit) and
 * steps, case and surrounding spaces aside. The database's recipe_content_key compares the same lines.
 */
export function sameTranslationText(a: StoredRecipeText, b: StoredRecipeText): boolean {
  const left = contentLines(a);
  const right = contentLines(b);
  return left !== null && right !== null && left.every((line, i) => line === right[i]);
}

/**
 * Translates, or hands the text back as it is when it is already in that language (a wrong source label), with no
 * model call, the shortcut translate-recipe takes.
 */
export async function translateOrKeep(
  source: TranslationSource,
  language: AppLanguage,
  translate: (input: TranslateRecipeInput) => Promise<TranslatedRecipe>,
): Promise<TranslatedRecipe> {
  if (recipeAlreadyInLanguage(source, language)) {
    return { title: source.title, ingredients: source.ingredients, instructions: source.instructions, usage: null };
  }
  return await translate({ ...source, targetLanguage: language });
}
