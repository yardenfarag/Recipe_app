import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  extractInstagramId,
  extractTikTokId,
  extractYouTubeId,
  recipeUrlsMatch,
  type Platform,
} from './platform.ts';

/** Looks up a saved recipe for the authenticated user that matches the input URL. */
export async function findExistingRecipeForUser(
  supabase: SupabaseClient,
  inputUrl: string,
  platform: Platform,
  videoId: string | null,
): Promise<Record<string, unknown> | null> {
  const { data: recipes, error } = await supabase
    .from('recipes')
    .select('*')
    .not('original_url', 'is', null);

  if (error || !recipes) {
    console.error('recipeLookup fetch error:', error);
    return null;
  }

  return (
    recipes.find((recipe) =>
      recipeUrlsMatch(
        inputUrl,
        videoId,
        recipe.original_url as string | undefined,
        (recipe.platform as Platform | undefined) ?? platform,
      ),
    ) ?? null
  );
}

export function createAuthedSupabase(authHeader: string) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseAnonKey) return null;

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
}

export function extractVideoIdForPlatform(url: string, platform: Platform): string | null {
  switch (platform) {
    case 'youtube':
      return extractYouTubeId(url);
    case 'instagram':
      return extractInstagramId(url);
    case 'tiktok':
      return extractTikTokId(url);
    default:
      return null;
  }
}
