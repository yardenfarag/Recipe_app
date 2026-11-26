import { supabase } from './client';
import type { Ingredient, Instruction, RecipeTranslationContent } from '../../types/recipe';

/**
 * Hub cards in the app languages (recipe_card_translations, PIN-77). The server makes them in the background when a
 * recipe is extracted, so a card may have none yet: then it is shown as written. Read-only; the apps never translate a
 * card themselves.
 */

/** A database without the table yet (the apps can ship before the migration runs) reads as "no translations". */
function tableMissing(error: { code?: string; message: string }): boolean {
  return error.code === 'PGRST205' || error.code === '42P01' || error.message.includes('recipe_card_translations');
}

function content(row: {
  title: string;
  ingredients: unknown;
  instructions: unknown;
  translation_version?: number | null;
}): RecipeTranslationContent {
  return {
    title: row.title,
    ingredients: Array.isArray(row.ingredients) ? (row.ingredients as Ingredient[]) : [],
    instructions: Array.isArray(row.instructions) ? (row.instructions as Instruction[]) : [],
    translation_version: row.translation_version ?? null,
  };
}

/** One card in `languageCode`, or null when it has no translation into it. */
export async function fetchRecipeCardTranslation(
  cardId: string,
  languageCode: string,
): Promise<RecipeTranslationContent | null> {
  const { data, error } = await supabase
    .from('recipe_card_translations')
    .select('title, ingredients, instructions, translation_version')
    .eq('card_id', cardId)
    .eq('language_code', languageCode)
    .maybeSingle();
  if (error) {
    if (tableMissing(error)) return null;
    throw error;
  }
  return data ? content(data) : null;
}

/** The translated titles of many cards in one query, by card id. Cards without one are left out. */
export async function fetchRecipeCardTitles(
  languageCode: string,
  cardIds: string[],
): Promise<Record<string, string>> {
  const ids = [...new Set(cardIds)];
  if (ids.length === 0) return {};
  const { data, error } = await supabase
    .from('recipe_card_translations')
    .select('card_id, title')
    .eq('language_code', languageCode)
    .in('card_id', ids);
  if (error) {
    if (tableMissing(error)) return {};
    throw error;
  }
  const titles: Record<string, string> = {};
  for (const row of data ?? []) {
    const title = row.title?.trim();
    if (title) titles[row.card_id] = title;
  }
  return titles;
}
