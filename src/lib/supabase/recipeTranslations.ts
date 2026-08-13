import { supabase } from '@/lib/supabase/client';
import type { Ingredient, Instruction, RecipeTranslationContent } from '@/types/recipe';

export type RecipeTranslationRow = RecipeTranslationContent & {
  recipe_id: string;
  language_code: string;
};

function mapRow(row: {
  recipe_id: string;
  language_code: string;
  title: string;
  ingredients: Ingredient[];
  instructions: Instruction[];
}): RecipeTranslationRow {
  return {
    recipe_id: row.recipe_id,
    language_code: row.language_code,
    title: row.title,
    ingredients: row.ingredients,
    instructions: row.instructions,
  };
}

export async function fetchRecipeTranslation(
  recipeId: string,
  languageCode: string,
): Promise<RecipeTranslationContent | null> {
  const { data, error } = await supabase
    .from('recipe_translations')
    .select('title, ingredients, instructions')
    .eq('recipe_id', recipeId)
    .eq('language_code', languageCode)
    .maybeSingle();

  if (error) {
    if (error.code === 'PGRST205' || error.message.includes('recipe_translations')) {
      return null;
    }
    throw error;
  }
  if (!data) return null;
  return {
    title: data.title as string,
    ingredients: data.ingredients as Ingredient[],
    instructions: data.instructions as Instruction[],
  };
}

/** Titles (and full content) for many recipes in one language — library hydration. */
export async function fetchRecipeTranslationsForLanguage(
  languageCode: string,
  recipeIds?: string[],
): Promise<Record<string, RecipeTranslationContent>> {
  let query = supabase
    .from('recipe_translations')
    .select('recipe_id, title, ingredients, instructions')
    .eq('language_code', languageCode);

  if (recipeIds && recipeIds.length > 0) {
    query = query.in('recipe_id', recipeIds);
  }

  const { data, error } = await query;
  if (error) {
    if (error.code === 'PGRST205' || error.message.includes('recipe_translations')) {
      return {};
    }
    throw error;
  }

  const map: Record<string, RecipeTranslationContent> = {};
  for (const row of data ?? []) {
    map[row.recipe_id as string] = {
      title: row.title as string,
      ingredients: row.ingredients as Ingredient[],
      instructions: row.instructions as Instruction[],
    };
  }
  return map;
}

export async function upsertRecipeTranslation(
  recipeId: string,
  languageCode: string,
  content: RecipeTranslationContent,
): Promise<void> {
  let lastError: { code?: string; message: string } | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await supabase
      .from('recipe_translations')
      .upsert(
        {
          recipe_id: recipeId,
          language_code: languageCode,
          title: content.title,
          ingredients: content.ingredients,
          instructions: content.instructions,
        },
        { onConflict: 'recipe_id,language_code' },
      )
      .select('recipe_id, language_code')
      .single();

    if (!error && data?.recipe_id === recipeId && data?.language_code === languageCode) {
      return;
    }

    lastError = error ?? { message: 'Translation save could not be verified.' };
    const retryable =
      !error?.code ||
      error.code.startsWith('5') ||
      error.code === 'PGRST000' ||
      /fetch|network|timeout|connection/i.test(error.message);
    if (!retryable || attempt === 2) break;
    await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
  }

  if (lastError) {
    if (
      lastError.code === 'PGRST205' ||
      lastError.message.includes('recipe_translations')
    ) {
      throw new Error(
        'Recipe translations are not enabled yet — run migration 0014_recipe_translations.sql in Supabase.',
      );
    }
    throw new Error(lastError.message);
  }
}

export async function deleteRecipeTranslations(recipeId: string): Promise<void> {
  const { error } = await supabase.from('recipe_translations').delete().eq('recipe_id', recipeId);
  if (error && error.code !== 'PGRST205') throw error;
}

export { mapRow };
