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
  const { error } = await supabase.from('recipe_translations').upsert(
    {
      recipe_id: recipeId,
      language_code: languageCode,
      title: content.title,
      ingredients: content.ingredients,
      instructions: content.instructions,
    },
    { onConflict: 'recipe_id,language_code' },
  );

  if (error) {
    if (error.code === 'PGRST205' || error.message.includes('recipe_translations')) {
      throw new Error(
        'Recipe translations are not enabled yet — run migration 0014_recipe_translations.sql in Supabase.',
      );
    }
    throw error;
  }
}

export async function deleteRecipeTranslations(recipeId: string): Promise<void> {
  const { error } = await supabase.from('recipe_translations').delete().eq('recipe_id', recipeId);
  if (error && error.code !== 'PGRST205') throw error;
}

export { mapRow };
