import { normalizeStoredCalories } from '../_shared/calories.ts';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { extractRecipeWithLadder, GeminiRecipe } from '../_shared/gemini.ts';
import {
  canonicalInstagramUrl,
  canonicalTikTokUrl,
  canonicalYouTubeWatchUrl,
  detectPlatform,
  LIVE_PLATFORMS,
  type Platform,
  youTubeThumbnail,
} from '../_shared/platform.ts';
import {
  createAuthedSupabase,
  extractVideoIdForPlatform,
  findExistingRecipeForUser,
} from '../_shared/recipeLookup.ts';
import type { PlatformMeta } from '../_shared/platformMeta.ts';
import { fetchInstagramMeta } from '../_shared/instagram.ts';
import { fetchTikTokMeta } from '../_shared/tiktok.ts';
import { fetchYouTubeMeta } from '../_shared/youtube.ts';
import { FetchError } from '../_shared/errors.ts';
import { persistSocialThumbnail } from '../_shared/persistThumbnail.ts';

// Response contract consumed by the app (mirrors ExtractionResult in ADR 004).
type ExtractionStatus = 'full' | 'partial' | 'failed' | 'coming_soon';

/**
 * POST { url } -> { status, platform, recipe? , message? , cached? }
 *
 * Detects the platform, rejects anything not yet live (ADR 003), then for
 * YouTube: returns an existing saved recipe when the URL is already in the
 * user's library, otherwise runs the content ladder (description → comments →
 * captions → video) before classifying the result.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  let url: string;
  try {
    const body = await req.json();
    url = String(body.url ?? '').trim();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  if (!url) {
    return jsonResponse({ error: 'Missing "url" in request body' }, 400);
  }

  const platform = detectPlatform(url);

  // ADR 003 — staged rollout: reject non-live platforms with a clear message.
  if (!LIVE_PLATFORMS.includes(platform)) {
    return jsonResponse({
      status: 'coming_soon' as ExtractionStatus,
      platform,
      message:
        platform === 'unknown'
          ? "We couldn't recognize that link. Try a YouTube, Instagram, or TikTok video."
          : `${capitalize(platform)} support is coming soon — we're starting with YouTube.`,
    });
  }

  const contentId = extractVideoIdForPlatform(url, platform);

  if (platform === 'youtube' && !contentId) {
    return jsonResponse({
      status: 'failed' as ExtractionStatus,
      platform,
      message: "That doesn't look like a valid YouTube video link.",
    });
  }

  if (platform === 'instagram' && !contentId) {
    return jsonResponse({
      status: 'failed' as ExtractionStatus,
      platform,
      message: "That doesn't look like a valid Instagram reel or post link.",
    });
  }

  const authHeader = req.headers.get('Authorization');
  if (authHeader) {
    const supabase = createAuthedSupabase(authHeader);
    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const existing = await findExistingRecipeForUser(supabase, url, platform, contentId);
        if (existing) {
          return jsonResponse({
            status: existing.extraction_status ?? 'full',
            platform,
            recipe: existing,
            cached: true,
          });
        }
      }
    }
  }

  try {
    console.log('[extract-recipe] start', { platform, url, contentId });

    const meta = await fetchPlatformMeta(platform, url, contentId);
    console.log('[extract-recipe] meta ready', {
      platform,
      contentId: meta.contentId ?? contentId,
      hasDescription: Boolean(meta.description?.trim()),
      descriptionLen: meta.description?.trim().length ?? 0,
      comments: meta.topComments.length,
      hasCaptions: Boolean(meta.captions?.trim()),
      hasVideoUrl: Boolean(meta.videoUrl),
      videoUrlHost: meta.videoUrl ? safeHost(meta.videoUrl) : null,
      hasThumbnail: Boolean(meta.thumbnailUrl),
    });

    const { recipe: gemini, source } = await extractRecipeWithLadder({
      platform,
      sourceUrl: url,
      videoUrl: meta.videoUrl,
      description: meta.description,
      captions: meta.captions,
      topComments: meta.topComments,
    });

    console.log('[extract-recipe] ladder done', {
      source,
      foundRecipe: gemini.found_recipe,
      title: gemini.title?.slice(0, 80),
      ingredients: gemini.ingredients?.length ?? 0,
      instructions: gemini.instructions?.length ?? 0,
    });

    const { status, missingFields } = classify(gemini);

    if (status === 'failed') {
      return jsonResponse({
        status,
        platform,
        message: "Couldn't find a recipe in this video. Try a different link.",
      });
    }

    const resolvedContentId = meta.contentId ?? contentId;
    const imageUrl = await resolveThumbnail(platform, resolvedContentId, meta);
    console.log('[extract-recipe] thumbnail', {
      platform,
      hasImage: Boolean(imageUrl),
      imageHost: imageUrl ? safeHost(imageUrl) : null,
    });

    const recipe = {
      title: gemini.title,
      original_url: canonicalOriginalUrl(platform, resolvedContentId, url),
      platform,
      image_url: imageUrl,
      ingredients: gemini.ingredients,
      instructions: gemini.instructions,
      servings: gemini.servings > 0 ? gemini.servings : 1,
      calories: normalizeStoredCalories(
        gemini.calories ?? null,
        gemini.servings > 0 ? gemini.servings : 1,
      ),
      estimated_time_minutes: gemini.estimated_time_minutes ?? null,
      cost_estimate: gemini.cost_estimate ?? null,
      effort_level: gemini.effort_level ?? null,
      extraction_status: status,
      extraction_source: source,
      calories_reasoning: gemini.calories_reasoning?.trim() || null,
      missing_fields: missingFields,
    };

    return jsonResponse({ status, platform, recipe });
  } catch (err) {
    console.error('extract-recipe error:', err);

    if (err instanceof FetchError) {
      const lower = err.message.toLowerCase();
      const message =
        lower.includes('not publicly accessible') ||
        lower.includes('too many requests') ||
        lower.includes('not found') ||
        lower.includes('invalid instagram') ||
        lower.includes('scrapecreators request failed') ||
        lower.includes('gemini request failed')
          ? err.message.includes('ScrapeCreators request failed')
            ? 'Instagram took too long to respond — try again.'
            : err.message.includes('timedOut=true')
              ? 'Recipe extraction timed out — try again in a moment.'
              : err.message
          : "Couldn't load this video — try again.";

      return jsonResponse(
        {
          status: 'failed' as ExtractionStatus,
          platform,
          message,
        },
        err.message.includes('Too many requests') ? 429 : 502,
      );
    }

    return jsonResponse(
      {
        status: 'failed' as ExtractionStatus,
        platform,
        message: 'Something went wrong while reading the video. Please try again.',
      },
      500,
    );
  }
});

/** Buckets a Gemini result into full/failed/partial per the ADR 004 rules. */
function classify(r: GeminiRecipe): {
  status: Exclude<ExtractionStatus, 'coming_soon'>;
  missingFields: string[];
} {
  const hasTitle = Boolean(r.found_recipe && r.title?.trim());
  const hasIngredients = r.ingredients?.length > 0;
  const hasInstructions = r.instructions?.length > 0;

  if (!hasTitle || (!hasIngredients && !hasInstructions)) {
    return { status: 'failed', missingFields: [] };
  }

  const missingFields: string[] = [];
  if (!hasIngredients) missingFields.push('ingredients');
  if (!hasInstructions) missingFields.push('instructions');
  if (r.calories == null) missingFields.push('calories');
  if (r.estimated_time_minutes == null) missingFields.push('estimated_time_minutes');
  if (!r.cost_estimate) missingFields.push('cost_estimate');
  if (!r.effort_level) missingFields.push('effort_level');

  // "full" needs title + ingredients + steps (ADR 004). Otherwise partial.
  const isFull = hasTitle && hasIngredients && hasInstructions;
  return { status: isFull ? 'full' : 'partial', missingFields };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

async function fetchPlatformMeta(
  platform: Platform,
  url: string,
  contentId: string | null,
): Promise<PlatformMeta> {
  switch (platform) {
    case 'youtube':
      return contentId ? await fetchYouTubeMeta(contentId) : { topComments: [] };
    case 'instagram':
      return await fetchInstagramMeta(url);
    case 'tiktok':
      return await fetchTikTokMeta(url);
    default:
      return { topComments: [] };
  }
}

function canonicalOriginalUrl(
  platform: Platform,
  contentId: string | null | undefined,
  url: string,
): string {
  if (platform === 'youtube' && contentId) return canonicalYouTubeWatchUrl(contentId);
  if (platform === 'instagram' && contentId) return canonicalInstagramUrl(contentId);
  if (platform === 'tiktok' && contentId) return canonicalTikTokUrl(contentId);
  return url.trim();
}

async function resolveThumbnail(
  platform: Platform,
  contentId: string | null | undefined,
  meta: PlatformMeta,
): Promise<string | null> {
  if (platform === 'youtube') {
    return meta.thumbnailUrl ?? (contentId ? youTubeThumbnail(contentId) : null);
  }

  if ((platform === 'instagram' || platform === 'tiktok') && meta.thumbnailUrl) {
    const hosted = await persistSocialThumbnail({
      sourceUrl: meta.thumbnailUrl,
      platform,
      contentId,
    });
    // Prefer durable Storage URL; fall back to CDN so the client still has a chance.
    return hosted ?? meta.thumbnailUrl;
  }

  return meta.thumbnailUrl ?? null;
}
