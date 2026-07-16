import { supabase } from '@/lib/supabase/client';
import { Recipe } from '@/types/recipe';

/** Recipe fields owned by the client on insert — server generates id/created_at. */
export type NewRecipe = Omit<Recipe, 'id' | 'created_at' | 'user_id'>;

export async function fetchRecipes(): Promise<Recipe[]> {
  const { data, error } = await supabase
    .from('recipes')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as Recipe[];
}

export async function fetchRecipeById(id: string): Promise<Recipe | null> {
  const { data, error } = await supabase.from('recipes').select('*').eq('id', id).single();

  if (error) {
    if (error.code === 'PGRST116') return null; // no rows
    throw error;
  }
  return data as Recipe;
}

export async function saveRecipe(recipe: NewRecipe): Promise<Recipe> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Must be signed in to save a recipe');

  const { data, error } = await supabase
    .from('recipes')
    .insert({ ...recipe, user_id: userData.user.id })
    .select()
    .single();

  if (error) throw error;
  return data as Recipe;
}

export async function deleteRecipe(id: string): Promise<void> {
  const { error } = await supabase.from('recipes').delete().eq('id', id);
  if (error) throw error;
}
