import {
  canonicalizeUrlForCompare,
  extractInstagramId,
  extractTikTokId,
} from '@/lib/platformUrls';
import { extractYouTubeId } from '@/lib/youtube';

export const HUB_PLATFORMS = ['youtube', 'instagram', 'tiktok', 'web'] as const;
export type HubPlatform = (typeof HUB_PLATFORMS)[number];

export function isHubPlatform(value: string | null | undefined): value is HubPlatform {
  return value === 'youtube' || value === 'instagram' || value === 'tiktok' || value === 'web';
}

/** One card per source: `youtube:id`, `instagram:shortcode`, `tiktok:id`, or `web:<canonical url>`. */
export function recipeCardCanonicalKey(
  platform: HubPlatform,
  url: string,
  contentId?: string | null,
): string | null {
  if (platform === 'youtube') {
    const id = contentId?.trim() || extractYouTubeId(url);
    return id ? `youtube:${id}` : null;
  }
  if (platform === 'instagram') {
    const id = contentId?.trim() || extractInstagramId(url);
    return id ? `instagram:${id}` : null;
  }
  if (platform === 'tiktok') {
    const id = contentId?.trim() || extractTikTokId(url);
    return id ? `tiktok:${id}` : null;
  }
  const canonical = canonicalizeUrlForCompare(url);
  return canonical ? `web:${canonical}` : null;
}

export type HubPublishableRecipe = {
  title?: string | null;
  original_url?: string | null;
  platform?: string | null;
  extraction_status?: string | null;
  extraction_source?: string | null;
  ingredients?: unknown[] | null;
  instructions?: unknown[] | null;
};

/** Public URL extracts only — never invented, photo, or partial cards. */
export function canPublishHubRecipe(recipe: HubPublishableRecipe): boolean {
  if (!isHubPlatform(recipe.platform ?? null)) return false;
  if (recipe.extraction_status !== 'full') return false;
  if (recipe.extraction_source === 'invented' || recipe.extraction_source === 'photo') {
    return false;
  }
  if (!recipe.title?.trim()) return false;
  if (!recipe.original_url?.trim()) return false;
  if ((recipe.ingredients?.length ?? 0) < 2) return false;
  if ((recipe.instructions?.length ?? 0) < 2) return false;
  return true;
}
