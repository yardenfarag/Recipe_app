import type { Db } from './supabaseAdmin.ts';
import {
  extractFacebookId,
  extractInstagramId,
  extractPinterestId,
  extractTikTokId,
  extractYouTubeId,
  recipeUrlsMatch,
  type Platform,
} from '../extraction/platform.ts';

// Moved to supabaseAdmin.ts so core/handler.ts needn't import extraction code (ADR 024 §2). Kept here for the
// functions that still import it from this file.
export { createAuthedSupabase } from './supabaseAdmin.ts';

/** Looks up a saved recipe for the authenticated user that matches the input URL. */
export async function findExistingRecipeForUser(
  supabase: Db,
  inputUrl: string,
  platform: Platform,
  videoId: string | null,
  origin: 'extracted' | 'invented' = 'extracted',
): Promise<Record<string, unknown> | null> {
  const { data: recipes, error } = await supabase
    .from('recipes')
    .select('*')
    .not('original_url', 'is', null);

  if (error || !recipes) {
    console.error('recipeLookup fetch error:', error);
    return null;
  }

  const wantInvented = origin === 'invented';
  return (
    recipes.find((recipe) => {
      const invented = recipe.extraction_source === 'invented';
      if (invented !== wantInvented) return false;
      return recipeUrlsMatch(
        inputUrl,
        videoId,
        recipe.original_url as string | undefined,
        (recipe.platform as Platform | undefined) ?? platform,
      );
    }) ?? null
  );
}

export function extractVideoIdForPlatform(url: string, platform: Platform): string | null {
  switch (platform) {
    case 'youtube':
      return extractYouTubeId(url);
    case 'instagram':
      return extractInstagramId(url);
    case 'tiktok':
      return extractTikTokId(url);
    case 'facebook':
      return extractFacebookId(url);
    case 'pinterest':
      return extractPinterestId(url);
    default:
      return null;
  }
}
