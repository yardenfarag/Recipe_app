import { supabase } from '@/lib/supabase/client';
import {
  detectPlatform,
  extractContentId,
  extractInstagramId,
  extractTikTokId,
  recipeUrlsMatch,
} from '@/lib/platformUrls';
import { recipeContentEquals } from '@/lib/recipeContentEquals';
import { extractYouTubeId, recipeUrlsMatch as youtubeUrlsMatch } from '@/lib/youtube';
import { recipeMatchesUrlOrigin, type RecipeUrlOrigin } from '@/lib/recipeOrigin';
import { Recipe } from '@/types/recipe';

/** Recipe fields owned by the client on insert — server generates id/created_at. */
export type NewRecipe = Omit<Recipe, 'id' | 'created_at' | 'user_id'>;

const DEFAULT_PAGE_SIZE = 40;

export async function fetchRecipes(): Promise<Recipe[]> {
  const { data, error } = await supabase
    .from('recipes')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as Recipe[];
}

export async function fetchRecipesPage(
  offset = 0,
  limit = DEFAULT_PAGE_SIZE,
): Promise<{ recipes: Recipe[]; total: number }> {
  const { data, error, count } = await supabase
    .from('recipes')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  const recipes = (data ?? []) as Recipe[];
  const total = typeof count === 'number' ? count : offset + recipes.length;
  return { recipes, total };
}

/** Finds a saved recipe matching a source URL without loading the full library. */
export async function fetchRecipeByUrl(
  url: string,
  origin: RecipeUrlOrigin = 'extracted',
): Promise<Recipe | null> {
  const trimmed = url.trim();
  if (!trimmed) return null;

  const platform = detectPlatform(trimmed);
  const matchesOrigin = (row: Recipe) => recipeMatchesUrlOrigin(row, origin);

  if (platform === 'youtube') {
    const videoId = extractYouTubeId(trimmed);
    if (videoId) {
      const { data, error } = await supabase
        .from('recipes')
        .select('*')
        .eq('platform', 'youtube')
        .ilike('original_url', `%${videoId}%`);

      if (error) throw error;
      const match = (data as Recipe[] | null)?.find(
        (row) => matchesOrigin(row) && youtubeUrlsMatch(trimmed, row.original_url),
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
      const match = (data as Recipe[] | null)?.find(
        (row) => matchesOrigin(row) && recipeUrlsMatch(trimmed, row.original_url, 'instagram'),
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
      const match = (data as Recipe[] | null)?.find(
        (row) => matchesOrigin(row) && recipeUrlsMatch(trimmed, row.original_url, 'tiktok'),
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
    const match = (data as Recipe[] | null)?.find(
      (row) => matchesOrigin(row) && recipeUrlsMatch(trimmed, row.original_url, platform),
    );
    if (match) return match;
  }

  const { data, error } = await supabase
    .from('recipes')
    .select('*')
    .eq('original_url', trimmed);

  if (error) throw error;
  return (data as Recipe[] | null)?.find(matchesOrigin) ?? null;
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

  const {
    translations: _translations,
    display_title: _displayTitle,
    ...persistable
  } = recipe;

  const { data, error } = await supabase
    .from('recipes')
    .insert({
      ...persistable,
      source_language: persistable.source_language ?? 'en',
      user_id: userData.user.id,
    })
    .select()
    .single();

  if (error) throw error;
  return data as Recipe;
}

export async function deleteRecipe(id: string): Promise<void> {
  const { error } = await supabase.from('recipes').delete().eq('id', id);
  if (error) throw error;
}

/** Renames a saved recipe's canonical title. */
export async function renameRecipe(id: string, title: string): Promise<void> {
  const trimmed = title.trim();
  if (!trimmed) throw new Error('Recipe name is required.');

  const { error } = await supabase.from('recipes').update({ title: trimmed }).eq('id', id);
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

export async function setRecipeTags(id: string, tags: string[]): Promise<void> {
  const { error } = await supabase.from('recipes').update({ tags }).eq('id', id);
  if (error) {
    if (error.message.includes('tags') || error.code === 'PGRST204') {
      throw new Error(
        'Recipe tags are not enabled yet — run migration 0008_recipe_tags.sql in Supabase.',
      );
    }
    throw error;
  }
}

/** Persists remix / swap / repair edits on an already-saved recipe (canonical fields only). */
export async function updateRecipeContent(
  id: string,
  content: {
    title: string;
    servings: number;
    ingredients: Recipe['ingredients'];
    instructions: Recipe['instructions'];
    calories?: number;
    extraction_status?: Recipe['extraction_status'];
    missing_fields?: string[];
    estimated_time_minutes?: number | null;
    cost_estimate?: Recipe['cost_estimate'] | null;
    effort_level?: Recipe['effort_level'] | null;
    tags?: string[];
    kitchen_adapted_summary?: string | null;
    kitchen_original?: Recipe['kitchen_original'] | null;
  },
): Promise<Recipe> {
  const existing = await fetchRecipeById(id);
  const textChanged = !existing || !recipeContentEquals(existing, content);

  const { data, error } = await supabase
    .from('recipes')
    .update({
      title: content.title,
      servings: content.servings,
      ingredients: content.ingredients,
      instructions: content.instructions,
      calories: content.calories,
      ...(content.extraction_status ? { extraction_status: content.extraction_status } : {}),
      ...(content.missing_fields ? { missing_fields: content.missing_fields } : {}),
      ...(content.estimated_time_minutes !== undefined
        ? { estimated_time_minutes: content.estimated_time_minutes }
        : {}),
      ...(content.cost_estimate !== undefined ? { cost_estimate: content.cost_estimate } : {}),
      ...(content.effort_level !== undefined ? { effort_level: content.effort_level } : {}),
      ...(content.tags ? { tags: content.tags } : {}),
      ...(content.kitchen_adapted_summary !== undefined
        ? { kitchen_adapted_summary: content.kitchen_adapted_summary }
        : {}),
      ...(content.kitchen_original !== undefined
        ? { kitchen_original: content.kitchen_original }
        : {}),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;

  // Only drop overlays when canonical text actually changed (remix / swap / edit).
  if (textChanged) {
    await supabase.from('recipe_translations').delete().eq('recipe_id', id);
  }

  return data as Recipe;
}

const COOK_NOTE_MAX = 160;

/** Marks a recipe as cooked (date + optional one-line note). */
export async function setRecipeCooked(
  id: string,
  cooked: { last_cooked_at: string; cook_note?: string | null },
): Promise<Recipe> {
  const note =
    typeof cooked.cook_note === 'string' ? cooked.cook_note.trim().slice(0, COOK_NOTE_MAX) : '';
  const { data, error } = await supabase
    .from('recipes')
    .update({
      last_cooked_at: cooked.last_cooked_at,
      cook_note: note || null,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as Recipe;
}
