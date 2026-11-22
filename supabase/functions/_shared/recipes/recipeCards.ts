import {
  canonicalInstagramUrl,
  canonicalTikTokUrl,
  canonicalYouTubeWatchUrl,
  extractInstagramId,
  extractTikTokId,
  extractYouTubeId,
  type Platform,
} from '../extraction/platform.ts';
import { type Db, type TablesUpdate, toJson } from '../core/supabaseAdmin.ts';

import { hubWebUrl } from './hubSourceUrl.ts';
import {
  moderateHubRecipe,
  stripRecipeLinks,
  type ModeratedRecipeInput,
  type ModerationResult,
} from './hubModeration.ts';
import { recipeAppliancesOf } from './enrich/appliances.ts';
import { deriveRecipeDiets, type DietsRecipeInput } from './enrich/recipeDiets.ts';
import { logUsageEvent } from '../core/usageLog.ts';
import { fitNutrition } from './recipeLimits.ts';
import { nutritionFitsCalories } from './nutrition.ts';
import { drawRecipeImage, type DrawRecipeImageResult, type RecipeImageInput } from './recipeImage.ts';

export type HubPlatform = 'youtube' | 'instagram' | 'tiktok' | 'web';

export interface HubRecipeSnapshot {
  title: string;
  original_url?: string | null;
  platform: Platform;
  image_url?: string | null;
  /** image_url is a picture Pinch drew (recipeImage.ts), not a photo of the dish. */
  image_generated?: boolean;
  source_video_url?: string | null;
  ingredients: unknown;
  instructions: unknown;
  servings: number;
  calories?: number | null;
  /** PIN-80: grams for all servings. null = not estimated. */
  nutrition?: unknown;
  estimated_time_minutes?: number | null;
  cost_estimate?: string | null;
  effort_level?: string | null;
  extraction_status: string;
  extraction_source?: string | null;
  tags?: string[] | null;
  source_language?: string | null;
  /** ADR 017: null = not analysed. */
  appliances?: unknown;
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
  // Null for a link that isn't a plain public page (hubSourceUrl.ts): no card is looked up or
  // published for it.
  const canonical = hubWebUrl(url);
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
  if (platform === 'web') return hubWebUrl(url) ?? url.trim();
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
    image_generated: card.image_generated === true && typeof card.image_url === 'string',
    source_video_url: typeof card.source_video_url === 'string' ? card.source_video_url : null,
    ingredients: card.ingredients ?? [],
    instructions: card.instructions ?? [],
    servings: typeof card.servings === 'number' && card.servings >= 1 ? card.servings : 1,
    calories: typeof card.calories === 'number' ? card.calories : null,
    nutrition: typeof card.calories === 'number' ? fitNutrition(card.nutrition) : null,
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
    appliances: recipeAppliancesOf(card),
  };
}

export async function findRecipeCard(
  admin: Db,
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
    } else if (data && !data.hidden_at) {
      // A hidden card (moderation or an admin) is never served: the link is extracted afresh.
      return data as Record<string, unknown>;
    }
  }

  return null;
}

/**
 * The picture a public card may show. A web page's image is only used once it is our own copy in
 * Storage: a link to the source site would let its owner change the picture on our page at any
 * time. YouTube thumbnails stay YouTube's links, and social ones are already copies.
 */
export function hubImageUrl(platform: HubPlatform, imageUrl: string | null | undefined): string | null {
  const url = imageUrl?.trim();
  if (!url) return null;
  if (platform !== 'web') return url;
  const base = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '');
  return base && url.startsWith(`${base}/storage/v1/object/public/recipe-thumbnails/`) ? url : null;
}

/** The card a publish wrote or found, when its diets still need checking (PIN-83). */
export type PublishedCard = { id: string; needsDiets: boolean };

export interface PublishOptions {
  /** For the usage row of the moderation call. */
  userId?: string | null;
  /** The check a new card must pass. Tests pass their own. */
  moderate?: (recipe: ModeratedRecipeInput) => Promise<ModerationResult>;
  /** Draws a picture for a card with none. Tests pass their own. */
  drawImage?: (admin: Db, recipe: RecipeImageInput) => Promise<DrawRecipeImageResult>;
}

/**
 * Publishes a full extraction as a public Hub card, or returns null when it stays private:
 * the link isn't a plain public page, the card is hidden, the moderation check rejected the
 * recipe, or the check couldn't run. Only a new card (or one replacing a partial card) is
 * checked; an existing full card's text never changes here.
 */
export async function publishRecipeCard(
  admin: Db,
  snapshot: HubRecipeSnapshot,
  contentId?: string | null,
  options: PublishOptions = {},
): Promise<PublishedCard | null> {
  if (!canPublishHubRecipe(snapshot) || !isHubPlatform(snapshot.platform)) return null;

  const url = snapshot.original_url?.trim();
  if (!url) return null;
  const key = recipeCardCanonicalKey(snapshot.platform, url, contentId);
  if (!key) return null;

  // The public page carries no links from the recipe text. Without them it must still be a recipe.
  const recipe = stripRecipeLinks(snapshot);
  if (!canPublishHubRecipe(recipe) || !isHubPlatform(recipe.platform)) return null;

  const canonicalUrl = recipeCardCanonicalUrl(recipe.platform, url, contentId);
  const imageUrl = hubImageUrl(recipe.platform, recipe.image_url);
  const row = {
    canonical_key: key,
    canonical_url: canonicalUrl,
    original_url: canonicalUrl,
    platform: recipe.platform,
    title: recipe.title.trim(),
    image_url: imageUrl,
    image_generated: imageUrl != null && recipe.image_generated === true,
    source_video_url: recipe.source_video_url ?? null,
    ingredients: toJson(recipe.ingredients ?? []),
    instructions: toJson(recipe.instructions ?? []),
    servings: recipe.servings >= 1 ? recipe.servings : 1,
    calories: recipe.calories ?? null,
    nutrition: recipe.calories == null ? null : toJson(fitNutrition(recipe.nutrition)),
    estimated_time_minutes: recipe.estimated_time_minutes ?? null,
    cost_estimate: recipe.cost_estimate ?? null,
    effort_level: recipe.effort_level ?? null,
    extraction_status: 'full',
    extraction_source: recipe.extraction_source ?? null,
    tags: recipe.tags ?? [],
    source_language: recipe.source_language ?? 'en',
    appliances: toJson(recipe.appliances ?? null),
    updated_at: new Date().toISOString(),
  };

  const { data: existing, error: existingError } = await admin
    .from('recipe_cards')
    .select('id, extraction_status, image_url, image_generated, appliances, calories, nutrition, diets, hidden_at')
    .eq('canonical_key', key)
    .maybeSingle();

  if (existingError) {
    console.error('[recipe-cards] existing lookup failed', existingError);
    return null;
  }
  // Hidden by moderation or an admin: it stays as it is until an admin restores it.
  if (existing?.hidden_at) return null;

  const shouldReplace = Boolean(existing) && existing?.extraction_status !== 'full';
  if (!existing || shouldReplace) {
    const review = await reviewForHub(admin, recipe, key, options);
    if (review.verdict === 'error') return null;
    if (review.verdict === 'reject') {
      // Keep the rejected card, hidden, so an admin can look at it and the link stays blocked.
      const hidden = { hidden_at: row.updated_at, hidden_reason: `moderation:${review.reason}` };
      const { error } = existing
        ? await admin.from('recipe_cards').update(hidden).eq('id', existing.id)
        : await admin.from('recipe_cards').insert({ ...row, ...hidden });
      if (error) console.error('[recipe-cards] could not store the rejected card', error);
      return null;
    }
  }

  if (!row.image_url && existing?.image_url) {
    // A replacement without a picture keeps the card's.
    row.image_url = existing.image_url;
    row.image_generated = existing.image_generated === true;
  } else if (!row.image_url) {
    // No photo anywhere (the site blocked our download, PIN-153 refuses its link): draw one before
    // the card is public, so the Hub never shows it empty. This runs after the import has
    // answered, so nobody waits for it. If it fails the card goes up without a picture.
    const drawn = await drawCardImage(admin, recipe, key, options);
    if (drawn) {
      row.image_url = drawn;
      row.image_generated = true;
    }
  }

  if (!existing) {
    const { data: inserted, error } = await admin.from('recipe_cards').insert(row).select('id').single();
    if (error) {
      console.error('[recipe-cards] insert failed', error);
      return null;
    }
    return { id: inserted.id as string, needsDiets: true };
  }

  // A real photo also replaces a drawn one.
  const shouldFillImage = Boolean(row.image_url) && row.image_url !== existing.image_url &&
    (!existing.image_url || (existing.image_generated === true && !row.image_generated));
  // Like the image: fill appliances on a card that has none, never overwrite (matches the recipe_appliances migration).
  const shouldFillAppliances = existing.appliances == null && row.appliances != null;
  // PIN-80: the same for macros, so a card published before them gets them from the next import,
  // but only when they fit the card's own calories (this extraction may have estimated others).
  const newNutrition = fitNutrition(row.nutrition);
  const shouldFillNutrition = existing.nutrition == null && newNutrition != null &&
    typeof existing.calories === 'number' && nutritionFitsCalories(newNutrition, existing.calories);
  const needsDiets = shouldReplace || existing.diets == null;
  if (!shouldReplace && !shouldFillImage && !shouldFillAppliances && !shouldFillNutrition) {
    return { id: existing.id as string, needsDiets };
  }

  const fill: TablesUpdate<'recipe_cards'> = { updated_at: row.updated_at };
  if (shouldFillImage) {
    fill.image_url = row.image_url;
    fill.image_generated = row.image_generated;
  }
  if (shouldFillAppliances) fill.appliances = row.appliances;
  if (shouldFillNutrition) fill.nutrition = row.nutrition;

  // New content means the old diet check no longer applies.
  const { error } = await admin
    .from('recipe_cards')
    .update(shouldReplace ? { ...row, diets: null } : fill)
    .eq('id', existing.id);
  if (error) {
    console.error('[recipe-cards] update failed', error);
    return null;
  }
  return { id: existing.id as string, needsDiets };
}

/** Draws a card's picture and logs its own usage row. The stored picture's URL, or null. */
async function drawCardImage(
  admin: Db,
  recipe: HubRecipeSnapshot,
  canonicalKey: string,
  options: PublishOptions,
): Promise<string | null> {
  const result = await (options.drawImage ?? drawRecipeImage)(admin, {
    title: recipe.title,
    ingredients: recipe.ingredients,
  });
  await logUsageEvent(admin, {
    userId: options.userId ?? null,
    action: 'recipe_image',
    platform: recipe.platform,
    status: result.ok ? 'ok' : 'failed',
    usages: result.usage ? [result.usage] : [],
    tokensCharged: 0,
    durationMs: result.ms,
    errorMessage: result.ok ? null : result.error,
    metadata: { canonical_key: canonicalKey, for: 'hub_card', ...(result.ok ? { model: result.model, bytes: result.bytes } : {}) },
  });
  return result.ok ? result.url : null;
}

/** Runs the moderation check and logs its own usage row, like the diet check below. */
async function reviewForHub(
  admin: Db,
  recipe: HubRecipeSnapshot,
  canonicalKey: string,
  options: PublishOptions,
): Promise<ModerationResult> {
  const started = Date.now();
  const review = await (options.moderate ?? moderateHubRecipe)(recipe);
  console.log('[recipe-cards] moderation', {
    verdict: review.verdict,
    reason: review.verdict === 'reject' ? review.reason : null,
    canonicalKey,
  });
  await logUsageEvent(admin, {
    userId: options.userId ?? null,
    action: 'hub_moderation',
    platform: recipe.platform,
    status: review.verdict === 'ok' ? 'ok' : review.verdict === 'reject' ? 'rejected' : 'failed',
    usages: review.usages,
    tokensCharged: 0,
    durationMs: Date.now() - started,
    errorMessage: review.verdict === 'error' ? review.error : null,
    metadata: { canonical_key: canonicalKey, reason: review.verdict === 'reject' ? review.reason : null },
  });
  return review;
}

/**
 * Checks which diets a published card fits and stores them (PIN-83). Writes only while the card's
 * diets are still null, so a concurrent check or the backfill is never overwritten. Logs its own
 * usage row, because extract-recipe has already logged the extract by the time this runs.
 */
export async function fillRecipeCardDiets(
  admin: Db,
  cardId: string,
  recipe: DietsRecipeInput,
  userId: string | null,
): Promise<void> {
  const started = Date.now();
  const result = await deriveRecipeDiets(recipe);
  let saved = false;
  if (result.diets !== null) {
    const { data, error } = await admin
      .from('recipe_cards')
      .update({ diets: result.diets })
      .eq('id', cardId)
      .is('diets', null)
      .select('id');
    if (error) console.error('[recipe-cards] diets update failed', error);
    saved = !error && (data ?? []).length > 0;
  }
  if (result.usages.length === 0) return;
  await logUsageEvent(admin, {
    userId,
    action: 'hub_diets',
    status: result.diets === null ? 'failed' : 'ok',
    usages: result.usages,
    tokensCharged: 0,
    durationMs: Date.now() - started,
    errorMessage: result.error ?? null,
    metadata: { card_id: cardId, diets: result.diets, saved },
  });
}

export async function userContributesToHub(
  admin: Db,
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

export async function touchRecipeCardHit(admin: Db, cardId: string): Promise<void> {
  const { error } = await admin.rpc('touch_recipe_card_hit', { p_card_id: cardId });
  if (error) console.error('[recipe-cards] hit increment failed', error);
}
