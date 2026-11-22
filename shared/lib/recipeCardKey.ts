import {
  canonicalizeUrlForCompare,
  extractFacebookId,
  extractInstagramId,
  extractTikTokId,
} from './platformUrls';
import { extractYouTubeId } from './youtube';

/** Pinterest is left out on purpose (ADR 029). */
export const HUB_PLATFORMS = ['youtube', 'instagram', 'tiktok', 'facebook', 'web'] as const;
export type HubPlatform = (typeof HUB_PLATFORMS)[number];

export function isHubPlatform(value: string | null | undefined): value is HubPlatform {
  return (HUB_PLATFORMS as readonly (string | null | undefined)[]).includes(value);
}

/**
 * One card per source: `youtube:id`, `instagram:shortcode`, `tiktok:id`, `facebook:id`, or
 * `web:<canonical url>`.
 */
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
  if (platform === 'facebook') {
    const id = contentId?.trim() || extractFacebookId(url);
    return id ? `facebook:${id}` : null;
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

/** Public URL extracts only — never invented, photo, written (ADR 018), or partial cards. */
export function canPublishHubRecipe(recipe: HubPublishableRecipe): boolean {
  if (!isHubPlatform(recipe.platform ?? null)) return false;
  if (recipe.extraction_status !== 'full') return false;
  if (
    recipe.extraction_source === 'invented' ||
    recipe.extraction_source === 'photo' ||
    recipe.extraction_source === 'manual'
  ) {
    return false;
  }
  if (!recipe.title?.trim()) return false;
  if (!recipe.original_url?.trim()) return false;
  if ((recipe.ingredients?.length ?? 0) < 2) return false;
  if ((recipe.instructions?.length ?? 0) < 2) return false;
  return true;
}
