import { normalizeStoredCalories } from '../_shared/calories.ts';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { FetchError } from '../_shared/errors.ts';
import { extractRecipeWithLadder, GeminiRecipe } from '../_shared/gemini.ts';
import { fetchInstagramMeta } from '../_shared/instagram.ts';
import {
  canonicalInstagramUrl,
  canonicalTikTokUrl,
  canonicalYouTubeWatchUrl,
  detectPlatform,
  LIVE_PLATFORMS,
  type Platform,
  youTubeThumbnail,
} from '../_shared/platform.ts';
import type { PlatformMeta } from '../_shared/platformMeta.ts';
import { persistSocialThumbnail } from '../_shared/persistThumbnail.ts';
import {
  estimateScrapeCredits,
  GUEST_EXTRACT_LIMIT,
  TOKEN_COST_EXTRACT,
} from '../_shared/pricing.ts';
import {
  createAuthedSupabase,
  extractVideoIdForPlatform,
  findExistingRecipeForUser,
} from '../_shared/recipeLookup.ts';
import { createServiceSupabase } from '../_shared/supabaseAdmin.ts';
import { normalizeRecipeTags } from '../_shared/tags.ts';
import { fetchTikTokMeta } from '../_shared/tiktok.ts';
import {
  getGuestExtractCount,
  getTokenBalance,
  guestRemainingFromCount,
  reserveGuestExtraction,
  spendTokens,
} from '../_shared/tokens.ts';
import { logUsageEvent } from '../_shared/usageLog.ts';
import { fetchYouTubeMeta } from '../_shared/youtube.ts';

// Response contract consumed by the app (mirrors ExtractionResult in ADR 004).
type ExtractionStatus = 'full' | 'partial' | 'failed' | 'coming_soon';

/**
 * POST { url, guest_install_id? } -> { status, platform, recipe?, message?, cached?, ... }
 *
 * Detects the platform, rejects anything not yet live (ADR 003), then for
 * YouTube: returns an existing saved recipe when the URL is already in the
 * user's library, otherwise runs the content ladder (description → comments →
 * captions → video) before classifying the result.
 *
 * Phase B: guests are capped server-side; signed-in users spend 10 tokens on
 * non-cached extractions (including failed recipe finds after provider work).
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const started = Date.now();
  let url: string;
  let guestInstallId: string | null = null;
  try {
    const body = await req.json();
    url = String(body.url ?? '').trim();
    const rawInstall = body.guest_install_id ?? body.guestInstallId;
    if (typeof rawInstall === 'string' && rawInstall.trim().length >= 8) {
      guestInstallId = rawInstall.trim().slice(0, 128);
    }
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

  const admin = createServiceSupabase();
  const authHeader = req.headers.get('Authorization');
  let userId: string | null = null;
  let authedClient = authHeader ? createAuthedSupabase(authHeader) : null;

  if (authedClient) {
    const {
      data: { user },
    } = await authedClient.auth.getUser();
    userId = user?.id ?? null;

    if (userId) {
      const existing = await findExistingRecipeForUser(authedClient, url, platform, contentId);
      if (existing) {
        await logUsageEvent(admin, {
          userId,
          action: 'extract',
          platform,
          status: 'cached',
          tokensCharged: 0,
          durationMs: Date.now() - started,
          metadata: { cached: true },
        });

        const balance = admin ? await getTokenBalance(admin, userId) : null;
        return jsonResponse({
          status: existing.extraction_status ?? 'full',
          platform,
          recipe: existing,
          cached: true,
          tokens_charged: 0,
          token_balance: balance,
        });
      }

      const balance = admin ? await getTokenBalance(admin, userId) : null;
      if (balance != null && balance < TOKEN_COST_EXTRACT) {
        await logUsageEvent(admin, {
          userId,
          action: 'extract',
          platform,
          status: 'insufficient_tokens',
          tokensCharged: 0,
          durationMs: Date.now() - started,
          metadata: { balance, required: TOKEN_COST_EXTRACT },
        });
        return jsonResponse(
          {
            status: 'failed' as ExtractionStatus,
            platform,
            code: 'insufficient_tokens',
            message: `You need ${TOKEN_COST_EXTRACT} tokens to extract a recipe. You have ${balance}.`,
            token_balance: balance,
            tokens_required: TOKEN_COST_EXTRACT,
          },
          402,
        );
      }
    }
  }

  let guestRemaining: number | null = null;
  if (!userId) {
    if (!guestInstallId || !admin) {
      return jsonResponse(
        {
          status: 'failed' as ExtractionStatus,
          platform,
          code: 'guest_id_required',
          message: 'Sign up to extract recipes, or update the app to continue as a guest.',
        },
        401,
      );
    }

    const reserved = await reserveGuestExtraction(admin, guestInstallId);
    if ('blocked' in reserved) {
      await logUsageEvent(admin, {
        guestInstallId,
        action: 'extract',
        platform,
        status: 'guest_limit',
        tokensCharged: 0,
        durationMs: Date.now() - started,
      });
      return jsonResponse(
        {
          status: 'failed' as ExtractionStatus,
          platform,
          code: 'guest_limit',
          message: `You've used your ${GUEST_EXTRACT_LIMIT} free recipe extractions. Sign up to keep going.`,
          guest_extracts_remaining: 0,
        },
        429,
      );
    }
    guestRemaining = reserved.remaining;
  }

  try {
    console.log('[extract-recipe] start', { platform, url, contentId, userId: Boolean(userId) });

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

    const {
      recipe: gemini,
      source,
      usages,
      usedInstagramVideoDownload,
    } = await extractRecipeWithLadder({
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
    const scrapeCredits = estimateScrapeCredits(platform, usedInstagramVideoDownload === true);

    if (status === 'failed') {
      let tokenBalance: number | null = null;
      let tokensCharged = 0;

      if (userId && admin) {
        const spent = await spendTokens(admin, userId, TOKEN_COST_EXTRACT, 'extract_failed', url, {
          platform,
          source,
        });
        if (spent.ok) {
          tokensCharged = TOKEN_COST_EXTRACT;
          tokenBalance = spent.balance;
        } else if (spent.code === 'insufficient_tokens') {
          tokenBalance = await getTokenBalance(admin, userId);
        }
      }

      await logUsageEvent(admin, {
        userId,
        guestInstallId: userId ? null : guestInstallId,
        action: 'extract',
        platform,
        status: 'failed',
        extractionSource: source,
        usages,
        scrapecreatorsCredits: scrapeCredits,
        tokensCharged,
        durationMs: Date.now() - started,
        errorMessage: 'No recipe found',
      });

      return jsonResponse({
        status,
        platform,
        message: "Couldn't find a recipe in this video. Try a different link.",
        tokens_charged: tokensCharged,
        token_balance: tokenBalance,
        guest_extracts_remaining: guestRemaining,
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
      time_reasoning: gemini.time_reasoning?.trim() || null,
      tags: normalizeRecipeTags(gemini.tags),
      missing_fields: missingFields,
    };

    let tokenBalance: number | null = null;
    let tokensCharged = 0;

    if (userId && admin) {
      const spent = await spendTokens(admin, userId, TOKEN_COST_EXTRACT, 'extract', url, {
        platform,
        source,
        status,
      });
      if (!spent.ok) {
        await logUsageEvent(admin, {
          userId,
          action: 'extract',
          platform,
          status: spent.code === 'insufficient_tokens' ? 'insufficient_tokens' : 'metering_error',
          extractionSource: source,
          usages,
          scrapecreatorsCredits: scrapeCredits,
          tokensCharged: 0,
          durationMs: Date.now() - started,
          errorMessage: spent.code,
        });
        return jsonResponse(
          {
            status: 'failed' as ExtractionStatus,
            platform,
            code: spent.code === 'insufficient_tokens' ? 'insufficient_tokens' : 'metering_error',
            message:
              spent.code === 'insufficient_tokens'
                ? `You need ${TOKEN_COST_EXTRACT} tokens to extract a recipe.`
                : 'Could not update your token balance. Please try again.',
            token_balance: await getTokenBalance(admin, userId),
            tokens_required: TOKEN_COST_EXTRACT,
          },
          spent.code === 'insufficient_tokens' ? 402 : 500,
        );
      }
      tokensCharged = TOKEN_COST_EXTRACT;
      tokenBalance = spent.balance;
    }

    await logUsageEvent(admin, {
      userId,
      guestInstallId: userId ? null : guestInstallId,
      action: 'extract',
      platform,
      status,
      extractionSource: source,
      usages,
      scrapecreatorsCredits: scrapeCredits,
      tokensCharged,
      durationMs: Date.now() - started,
    });

    return jsonResponse({
      status,
      platform,
      recipe,
      tokens_charged: tokensCharged,
      token_balance: tokenBalance,
      guest_extracts_remaining: guestRemaining,
    });
  } catch (err) {
    console.error('extract-recipe error:', err);

    // Guest slot already reserved — keep it (provider work may have run).
    if (!userId && guestInstallId && admin && guestRemaining == null) {
      guestRemaining = guestRemainingFromCount(await getGuestExtractCount(admin, guestInstallId));
    }

    const errorMessage = err instanceof Error ? err.message : String(err);
    await logUsageEvent(admin, {
      userId,
      guestInstallId: userId ? null : guestInstallId,
      action: 'extract',
      platform,
      status: 'error',
      tokensCharged: 0,
      durationMs: Date.now() - started,
      errorMessage: errorMessage.slice(0, 500),
      scrapecreatorsCredits: estimateScrapeCredits(platform, false),
    });

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
          guest_extracts_remaining: guestRemaining,
        },
        err.message.includes('Too many requests') ? 429 : 502,
      );
    }

    return jsonResponse(
      {
        status: 'failed' as ExtractionStatus,
        platform,
        message: 'Something went wrong while reading the video. Please try again.',
        guest_extracts_remaining: guestRemaining,
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
