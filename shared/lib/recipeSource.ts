import { detectPlatform } from './platformUrls';
import { recipeHasSource } from './recipeOrigin';
import type { Platform, Recipe } from '../types/recipe';

/** Where a recipe was saved from, for the "Saved from TikTok · @lazy.chef" line and a card's source chip. */
export type RecipeSource = {
  platform: Exclude<Platform, 'unknown'>;
  /**
   * The name to show: the platform's own name ("TikTok"), or for a website its address without "www."
   * ("smittenkitchen.com"). Null for a photo and for a website whose address can't be read: the screen then uses
   * its own translated word ("Photo", "Website").
   */
  name: string | null;
  /** The account that posted it, when the link names one: "@lazy.chef". */
  handle: string | null;
};

const BRAND: Partial<Record<Platform, string>> = {
  youtube: 'YouTube',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  pinterest: 'Pinterest',
};

/** "@lazy.chef" from tiktok.com/@lazy.chef/video/1 or youtube.com/@channel. */
function handleFrom(url: URL): string | null {
  const segment = url.pathname.split('/').find((part) => part.startsWith('@') && part.length > 1);
  if (!segment) return null;
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * Where a saved recipe came from. Null for a recipe with no source: one that was written by hand or guessed, or one
 * that has neither a link nor a platform.
 */
export function recipeSource(recipe: Pick<Recipe, 'platform' | 'original_url' | 'extraction_source'>): RecipeSource | null {
  if (!recipeHasSource(recipe)) return null;
  const link = recipe.original_url?.trim() ?? '';
  let url: URL | null = null;
  try {
    url = link ? new URL(link) : null;
  } catch {
    url = null;
  }
  const detected = recipe.platform && recipe.platform !== 'unknown' ? recipe.platform : link ? detectPlatform(link) : 'unknown';
  if (detected === 'unknown') return null;
  if (detected === 'photo') return { platform: 'photo', name: null, handle: null };
  if (detected === 'web') return { platform: 'web', name: url ? url.hostname.replace(/^www\./i, '') : null, handle: null };
  return { platform: detected, name: BRAND[detected] ?? null, handle: url ? handleFrom(url) : null };
}
