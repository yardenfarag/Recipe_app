import {
  canonicalInstagramUrl,
  canonicalTikTokUrl,
  canonicalYouTubeWatchUrl,
  extractInstagramId,
  extractTikTokId,
  extractYouTubeId,
  type Platform,
} from './platform.ts';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type HubPlatform = 'youtube' | 'instagram' | 'tiktok' | 'web';

export interface HubRecipeSnapshot {
  title: string;
  original_url?: string | null;
  platform: Platform;
  image_url?: string | null;
  source_video_url?: string | null;
  ingredients: unknown;
  instructions: unknown;
  servings: number;
  calories?: number | null;
  estimated_time_minutes?: number | null;
  cost_estimate?: string | null;
  effort_level?: string | null;
  extraction_status: string;
  extraction_source?: string | null;
  tags?: string[] | null;
  source_language?: string | null;
}

function canonicalizeUrlForCompare(url: string): string {
  try {
    const u = new URL(url.trim());
    u.hash = '';
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|mc_|ref$)/i.test(key)) {
        u.searchParams.delete(key);
      }
    }
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
    let path = u.pathname;
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    u.pathname = path;
    return u.toString();
  } catch {
    return url.trim();
  }
}

export function isHubPlatform(value: string | null | undefined): value is HubPlatform {
  return value === 'youtube' || value === 'instagram' || value === 'tiktok' || value === 'web';
}

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

export function recipeCardCanonicalUrl(
  platform: HubPlatform,
  url: string,
  contentId?: string | null,
): string {
  if (platform === 'youtube' && contentId) return canonicalYouTubeWatchUrl(contentId);
  if (platform === 'instagram' && contentId) return canonicalInstagramUrl(contentId);
  if (platform === 'tiktok' && contentId) return canonicalTikTokUrl(contentId);
  return url.trim();
}

export function canPublishHubRecipe(recipe: {
  title?: string | null;
  original_url?: string | null;
  platform?: string | null;
  extraction_status?: string | null;
  extraction_source?: string | null;
  ingredients?: unknown;
  instructions?: unknown;
}): boolean {
  if (!isHubPlatform(recipe.platform ?? null)) return false;
  if (recipe.extraction_status !== 'full') return false;
  if (recipe.extraction_source === 'invented' || recipe.extraction_source === 'photo') {
    return false;
  }
  if (!recipe.title?.trim()) return false;
  if (!recipe.original_url?.trim()) return false;
  if (!Array.isArray(recipe.ingredients) || recipe.ingredients.length < 2) return false;
  if (!Array.isArray(recipe.instructions) || recipe.instructions.length < 2) return false;
  return true;
}

export function hubCardToExtractRecipe(card: Record<string, unknown>): HubRecipeSnapshot {
  return {
    title: typeof card.title === 'string' ? card.title : '',
    original_url: typeof card.original_url === 'string' ? card.original_url : null,
    platform: (typeof card.platform === 'string' ? card.platform : 'unknown') as Platform,
    image_url: typeof card.image_url === 'string' ? card.image_url : null,
    source_video_url: typeof card.source_video_url === 'string' ? card.source_video_url : null,
    ingredients: card.ingredients ?? [],
    instructions: card.instructions ?? [],
    servings: typeof card.servings === 'number' && card.servings >= 1 ? card.servings : 1,
    calories: typeof card.calories === 'number' ? card.calories : null,
    estimated_time_minutes:
      typeof card.estimated_time_minutes === 'number' ? card.estimated_time_minutes : null,
    cost_estimate: typeof card.cost_estimate === 'string' ? card.cost_estimate : null,
    effort_level: typeof card.effort_level === 'string' ? card.effort_level : null,
    extraction_status:
      typeof card.extraction_status === 'string' ? card.extraction_status : 'full',
    extraction_source:
      typeof card.extraction_source === 'string' ? card.extraction_source : null,
    tags: Array.isArray(card.tags) ? (card.tags as string[]) : [],
    source_language: typeof card.source_language === 'string' ? card.source_language : 'en',
  };
}

export async function findRecipeCard(
  admin: SupabaseClient,
  platform: Platform,
  url: string,
  contentId?: string | null,
): Promise<Record<string, unknown> | null> {
  if (!isHubPlatform(platform)) return null;

  const key = recipeCardCanonicalKey(platform, url, contentId);
  if (key) {
    const { data, error } = await admin
      .from('recipe_cards')
      .select('*')
      .eq('canonical_key', key)
      .maybeSingle();
    if (error) {
      console.error('[recipe-cards] lookup by key failed', error);
    } else if (data) {
      return data as Record<string, unknown>;
    }
  }

  return null;
}

export async function publishRecipeCard(
  admin: SupabaseClient,
  recipe: HubRecipeSnapshot,
  contentId?: string | null,
): Promise<void> {
  if (!canPublishHubRecipe(recipe) || !isHubPlatform(recipe.platform)) return;

  const url = recipe.original_url?.trim();
  if (!url) return;
  const key = recipeCardCanonicalKey(recipe.platform, url, contentId);
  if (!key) return;

  const canonicalUrl = recipeCardCanonicalUrl(recipe.platform, url, contentId);
  const row = {
    canonical_key: key,
    canonical_url: canonicalUrl,
    original_url: canonicalUrl,
    platform: recipe.platform,
    title: recipe.title.trim(),
    image_url: recipe.image_url ?? null,
    source_video_url: recipe.source_video_url ?? null,
    ingredients: recipe.ingredients ?? [],
    instructions: recipe.instructions ?? [],
    servings: recipe.servings >= 1 ? recipe.servings : 1,
    calories: recipe.calories ?? null,
    estimated_time_minutes: recipe.estimated_time_minutes ?? null,
    cost_estimate: recipe.cost_estimate ?? null,
    effort_level: recipe.effort_level ?? null,
    extraction_status: 'full',
    extraction_source: recipe.extraction_source ?? null,
    tags: recipe.tags ?? [],
    source_language: recipe.source_language ?? 'en',
    updated_at: new Date().toISOString(),
  };

  const { data: existing, error: existingError } = await admin
    .from('recipe_cards')
    .select('id, extraction_status, image_url')
    .eq('canonical_key', key)
    .maybeSingle();

  if (existingError) {
    console.error('[recipe-cards] existing lookup failed', existingError);
    return;
  }

  if (!existing) {
    const { error } = await admin.from('recipe_cards').insert(row);
    if (error) console.error('[recipe-cards] insert failed', error);
    return;
  }

  const shouldReplace = existing.extraction_status !== 'full';
  const shouldFillImage = !existing.image_url && row.image_url;
  if (!shouldReplace && !shouldFillImage) return;

  const { error } = await admin
    .from('recipe_cards')
    .update(shouldReplace ? row : { image_url: row.image_url, updated_at: row.updated_at })
    .eq('id', existing.id);
  if (error) console.error('[recipe-cards] update failed', error);
}

export async function userContributesToHub(
  admin: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from('profiles')
    .select('contribute_to_hub')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    console.error('[recipe-cards] contribute flag lookup failed', error);
    return true;
  }
  return data?.contribute_to_hub !== false;
}

export async function touchRecipeCardHit(admin: SupabaseClient, cardId: string): Promise<void> {
  const { error } = await admin.rpc('touch_recipe_card_hit', { p_card_id: cardId });
  if (error) console.error('[recipe-cards] hit increment failed', error);
}
