import { supabase } from '@/lib/supabase/client';
import {
  detectPlatform,
  extractContentId,
  extractInstagramId,
  extractTikTokId,
  recipeUrlsMatch,
} from '@/lib/platformUrls';
import { extractYouTubeId, recipeUrlsMatch as youtubeUrlsMatch } from '@/lib/youtube';
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

/** Finds a saved recipe matching a source URL without loading the full library. */
export async function fetchRecipeByUrl(url: string): Promise<Recipe | null> {
  const trimmed = url.trim();
  if (!trimmed) return null;

  const platform = detectPlatform(trimmed);

  if (platform === 'youtube') {
    const videoId = extractYouTubeId(trimmed);
    if (videoId) {
      const { data, error } = await supabase
        .from('recipes')
        .select('*')
        .eq('platform', 'youtube')
        .ilike('original_url', `%${videoId}%`);

      if (error) throw error;
      const match = (data as Recipe[] | null)?.find((row) =>
        youtubeUrlsMatch(trimmed, row.original_url),
      );
      return match ?? null;
    }
  }

  if (platform === 'instagram') {
    const shortcode = extractInstagramId(trimmed);
    if (shortcode) {
      const { data, error } = await supabase
        .from('recipes')
        .select('*')
        .eq('platform', 'instagram')
        .ilike('original_url', `%${shortcode}%`);

      if (error) throw error;
      const match = (data as Recipe[] | null)?.find((row) =>
        recipeUrlsMatch(trimmed, row.original_url, 'instagram'),
      );
      return match ?? null;
    }
  }

  if (platform === 'tiktok') {
    const videoId = extractTikTokId(trimmed);
    if (videoId) {
      const { data, error } = await supabase
        .from('recipes')
        .select('*')
        .eq('platform', 'tiktok')
        .ilike('original_url', `%${videoId}%`);

      if (error) throw error;
      const match = (data as Recipe[] | null)?.find((row) =>
        recipeUrlsMatch(trimmed, row.original_url, 'tiktok'),
      );
      return match ?? null;
    }
  }

  const contentId = extractContentId(trimmed, platform);
  if (contentId && platform !== 'unknown') {
    const { data, error } = await supabase
      .from('recipes')
      .select('*')
      .eq('platform', platform)
      .ilike('original_url', `%${contentId}%`);

    if (error) throw error;
    const match = (data as Recipe[] | null)?.find((row) =>
      recipeUrlsMatch(trimmed, row.original_url, platform),
    );
    if (match) return match;
  }

  const { data, error } = await supabase
    .from('recipes')
    .select('*')
    .eq('original_url', trimmed)
    .maybeSingle();

  if (error) throw error;
  return data as Recipe | null;
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

export async function setRecipeFavorite(id: string, isFavorite: boolean): Promise<void> {
  const { error } = await supabase.from('recipes').update({ is_favorite: isFavorite }).eq('id', id);
  if (error) {
    if (error.message.includes('is_favorite') || error.code === 'PGRST204') {
      throw new Error(
        'Favorites are not enabled yet — run migration 0004_recipe_favorites.sql in Supabase.',
      );
    }
    throw error;
  }
}
