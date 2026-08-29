import { normalizeStoredCalories } from '../_shared/calories.ts';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { FetchError } from '../_shared/errors.ts';
import { classifyGeminiRecipe } from '../_shared/classifyRecipe.ts';
import {
  buildContentGateInput,
  runContentGate,
  shouldSkipThinSocialGate,
} from '../_shared/contentGate.ts';
import { extractRecipeFromImage, extractRecipeWithLadder, GeminiRecipe } from '../_shared/gemini.ts';
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
import { persistSocialThumbnail, persistUploadedPhoto } from '../_shared/persistThumbnail.ts';
import { estimateScrapeCredits, GUEST_EXTRACT_LIMIT } from '../_shared/pricing.ts';
import {
  canStartExtract,
  finalizeSignedInExtract,
  finalizeGuestExtraction,
  getGuestExtractCount,
  guestRemainingFromCount,
  quotaFields,
  type QuotaSnapshot,
  type CreditReservation,
  type GuestExtractionReservation,
  markGuestExtractionCompensationPending,
  markSignedInExtractCompensationPending,
  refundGuestExtraction,
  refundSignedInExtract,
  refundSignedInExtractAfterFinalizeFailure,
  reserveGuestExtraction,
  reserveSignedInExtract,
} from '../_shared/quotas.ts';
import {
  createAuthedSupabase,
  extractVideoIdForPlatform,
  findExistingRecipeForUser,
} from '../_shared/recipeLookup.ts';
import { createServiceSupabase } from '../_shared/supabaseAdmin.ts';
import { normalizeRecipeTags } from '../_shared/tags.ts';
import { fetchTikTokMeta } from '../_shared/tiktok.ts';
import { logUsageEvent } from '../_shared/usageLog.ts';
import { formatMaxVideoDurationLabel, isVideoTooLong } from '../_shared/videoLimits.ts';
import { fetchWebRecipeMeta } from '../_shared/webRecipe.ts';
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
 * Guests: 3 lifetime extracts / install (cannot save). Signed-in users receive
 * 15 monthly credits and can spend non-expiring purchased credits after those.
 * Cached URL re-extract is free.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const started = Date.now();
  let url = '';
  let imageBase64: string | null = null;
  let imageMime = 'image/jpeg';
  let guestInstallId: string | null = null;
  let requestId = crypto.randomUUID();
  let forceExtract = false;
  try {
    const body = await req.json();
    url = String(body.url ?? '').trim();
    const rawImage = body.image_base64 ?? body.imageBase64;
    if (typeof rawImage === 'string' && rawImage.trim().length > 80) {
      const trimmed = rawImage.trim();
      const dataUrl = trimmed.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
      if (dataUrl) {
        imageMime = dataUrl[1];
        imageBase64 = dataUrl[2];
      } else {
        imageBase64 = trimmed.replace(/\s/g, '');
        if (typeof body.image_mime === 'string' && body.image_mime.startsWith('image/')) {
          imageMime = body.image_mime;
        }
      }
      if (imageBase64.length > 2_000_000) {
        return jsonResponse({ error: 'Image is too large. Try a smaller photo.' }, 400);
      }
    }
    const rawInstall = body.guest_install_id ?? body.guestInstallId;
    if (typeof rawInstall === 'string' && rawInstall.trim().length >= 8) {
      guestInstallId = rawInstall.trim().slice(0, 128);
    }
    const rawRequestId = body.request_id ?? body.requestId;
    if (typeof rawRequestId === 'string' && rawRequestId.trim().length >= 8) {
      requestId = rawRequestId.trim().slice(0, 128);
    }
    forceExtract = body.force_extract === true || body.forceExtract === true;
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  if (!url && !imageBase64) {
    return jsonResponse({ error: 'Missing "url" or "image_base64" in request body' }, 400);
  }

  const platform: Platform = imageBase64 ? 'photo' : detectPlatform(url);

  // ADR 003 — staged rollout: reject non-live platforms with a clear message.
  if (platform !== 'photo' && !LIVE_PLATFORMS.includes(platform)) {
    return jsonResponse({
      status: 'coming_soon' as ExtractionStatus,
      platform,
      message:
        platform === 'unknown'
          ? "We couldn't recognize that link. Try a YouTube, Instagram, TikTok, or recipe website link."
          : `${capitalize(platform)} support is coming soon — we're starting with YouTube.`,
    });
  }

  const contentId = platform === 'photo' ? null : extractVideoIdForPlatform(url, platform);

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
  let creditReservation: CreditReservation | null = null;
  let guestReservation: GuestExtractionReservation | null = null;
  let compensationPending = false;
  let authedClient = authHeader ? createAuthedSupabase(authHeader) : null;

  if (authedClient) {
    const {
      data: { user },
    } = await authedClient.auth.getUser();
    userId = user?.id ?? null;

    if (userId && admin && platform !== 'photo') {
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

        const quota = await canStartExtract(admin, userId);
        return jsonResponse({
          status: existing.extraction_status ?? 'full',
          platform,
          recipe: existing,
          cached: true,
          tokens_charged: 0,
          ...quotaFields(quota.snapshot),
        });
      }
    }
  }

  if (userId && !admin) {
    return jsonResponse(
      {
        status: 'failed' as ExtractionStatus,
        platform,
        code: 'metering_error',
        message: quotaBlockMessage('metering_error'),
      },
      500,
    );
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
  }

  try {
    console.log('[extract-recipe] start', {
      platform,
      url: url || null,
      hasImage: Boolean(imageBase64),
      contentId,
      userId: Boolean(userId),
    });

    let gemini: GeminiRecipe;
    let source: 'description' | 'comments' | 'captions' | 'video' | 'web' | 'photo';
    let usages: import('../_shared/pricing.ts').GeminiUsageSnapshot[] = [];
    let usedInstagramVideoDownload = false;
    let videoSkippedReason: 'too_long' | undefined;
    let scrapeCredits = 0;
    let imageUrl: string | null = null;
    let sourceVideoUrl: string | null = null;
    let originalUrl: string | null = null;
    let durationSeconds: number | undefined;
    let meta: PlatformMeta | null = null;

    if (platform !== 'photo') {
      meta = await fetchPlatformMeta(platform, url, contentId);
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
        durationSeconds: meta.durationSeconds ?? null,
      });
    }

    if (!admin) {
      return jsonResponse(
        {
          status: 'failed' as ExtractionStatus,
          platform,
          code: 'metering_error',
          message: quotaBlockMessage('metering_error'),
        },
        500,
      );
    }

    const tooLongNoText =
      platform !== 'photo' &&
      platform !== 'web' &&
      isVideoTooLong(meta?.durationSeconds) &&
      !hasTextSources(meta ?? { topComments: [] });

    const skipGate = shouldSkipThinSocialGate({
      platform,
      imageBase64,
      contentId,
      meta,
    });

    let gateKind: import('../_shared/contentGate.ts').ContentKind = 'mixed';
    let dishGuess = '';

    if (!skipGate) {
      const gate = await runContentGate({
        admin,
        userId,
        guestInstallId,
        input: buildContentGateInput({
          imageBase64,
          mimeType: imageMime,
          platform,
          contentId,
          meta,
          youtubeThumbnailUrl: contentId ? youTubeThumbnail(contentId) : null,
        }),
      });

      if (gate.status === 'limited') {
        await logUsageEvent(admin, {
          userId,
          guestInstallId: userId ? null : guestInstallId,
          action: 'content_gate',
          platform,
          status: 'daily_limit',
          tokensCharged: 0,
          durationMs: Date.now() - started,
        });
        return jsonResponse(
          {
            status: 'failed' as ExtractionStatus,
            platform,
            code: 'daily_limit',
            message: 'daily_limit',
          },
          429,
        );
      }
      if (gate.status === 'error') {
        await logUsageEvent(admin, {
          userId,
          guestInstallId: userId ? null : guestInstallId,
          action: 'content_gate',
          platform,
          status: 'error',
          tokensCharged: 0,
          durationMs: Date.now() - started,
          errorMessage: gate.error.slice(0, 500),
        });
        return jsonResponse(
          {
            status: 'failed' as ExtractionStatus,
            platform,
            code: 'gate_unavailable',
            message: 'Could not check if this is food. Please try again.',
          },
          503,
        );
      }

      gateKind = gate.kind;
      dishGuess = gate.dishGuess;

      await logUsageEvent(admin, {
        userId,
        guestInstallId: userId ? null : guestInstallId,
        action: 'content_gate',
        platform,
        status: gate.kind === 'unrelated' ? 'rejected' : 'ok',
        usages: gate.usage ? [gate.usage] : [],
        tokensCharged: 0,
        durationMs: Date.now() - started,
        metadata: { kind: gate.kind, dish_guess: gate.dishGuess, job: 'extract' },
      });
    }

    if (gateKind === 'unrelated') {
      return jsonResponse({
        status: 'failed' as ExtractionStatus,
        platform,
        code: 'not_food',
        message: imageBase64
          ? 'We can only Snap food, drinks, and recipes. Try a photo of the dish or a recipe card.'
          : "That doesn't look like food or a recipe. Try a cooking video, a food photo, or a recipe page.",
        tokens_charged: 0,
      });
    }

    if (!forceExtract && (gateKind === 'plated_dish' || tooLongNoText)) {
      return jsonResponse({
        status: 'failed' as ExtractionStatus,
        platform,
        code: 'looks_like_dish',
        dish_guess: dishGuess,
        message:
          tooLongNoText && gateKind !== 'plated_dish'
            ? `This video is longer than ${formatMaxVideoDurationLabel()} and has no recipe in the caption. We can guess a home version.`
            : 'This looks like a dish, not a written recipe.',
        tokens_charged: 0,
      });
    }

    const reserved = await reserveExtractCredits({
      admin,
      userId,
      guestInstallId,
      requestId,
      platform,
      started,
    });
    if (reserved.response) return reserved.response;
    creditReservation = reserved.creditReservation;
    guestReservation = reserved.guestReservation;
    guestRemaining = reserved.guestRemaining;

    if (platform === 'photo' && imageBase64) {
      const fromImage = await extractRecipeFromImage({
        imageBase64,
        mimeType: imageMime,
      });
      gemini = fromImage.recipe;
      if (fromImage.usage) usages = [fromImage.usage];
      source = 'photo';
      originalUrl = null;
    } else {
      const ladder = await extractRecipeWithLadder({
        platform,
        sourceUrl: url,
        videoUrl: platform === 'web' ? undefined : meta?.videoUrl,
        durationSeconds: platform === 'web' ? undefined : meta?.durationSeconds,
        description: meta?.description,
        captions: meta?.captions,
        topComments: meta?.topComments ?? [],
      });
      gemini = ladder.recipe;
      source = ladder.source;
      usages = ladder.usages;
      usedInstagramVideoDownload = ladder.usedInstagramVideoDownload === true;
      videoSkippedReason = ladder.videoSkippedReason;
      scrapeCredits = estimateScrapeCredits(platform, usedInstagramVideoDownload);
      const resolvedContentId = meta?.contentId ?? contentId;
      imageUrl = await resolveThumbnail(platform, resolvedContentId, meta ?? { topComments: [] });
      sourceVideoUrl = platform === 'web' ? meta?.videoUrl ?? null : null;
      originalUrl = canonicalOriginalUrl(platform, resolvedContentId, url);
      durationSeconds = meta?.durationSeconds;
      console.log('[extract-recipe] ladder done', {
        source,
        foundRecipe: gemini.found_recipe,
        title: gemini.title?.slice(0, 80),
        ingredients: gemini.ingredients?.length ?? 0,
        instructions: gemini.instructions?.length ?? 0,
      });
    }

    const { status, missingFields } = classify(gemini);

    if (status === 'failed') {
      const rejectedAsTooLong = videoSkippedReason === 'too_long';
      if (userId && creditReservation) {
        const refunded = await compensateSignedInExtract(
          admin,
          userId,
          creditReservation,
          rejectedAsTooLong ? 'video_too_long' : 'no_recipe_found',
        );
        compensationPending = !refunded;
        if (refunded) creditReservation = null;
      } else if (guestInstallId && guestReservation) {
        const refunded = await compensateGuestExtraction(
          admin,
          guestInstallId,
          guestReservation,
          rejectedAsTooLong ? 'video_too_long' : 'no_recipe_found',
        );
        compensationPending = !refunded;
        if (refunded) guestReservation = null;
      }
      // Failed finds do not consume recipe credits (same as guests).
      let snapshot: QuotaSnapshot | null = null;
      if (userId && admin) {
        const gate = await canStartExtract(admin, userId);
        snapshot = gate.snapshot;
      }

      await logUsageEvent(admin, {
        userId,
        guestInstallId: userId ? null : guestInstallId,
        action: 'extract',
        platform,
        status: rejectedAsTooLong ? 'video_too_long' : 'failed',
        extractionSource: source,
        usages,
        scrapecreatorsCredits: scrapeCredits,
        tokensCharged: 0,
        durationMs: Date.now() - started,
        errorMessage: rejectedAsTooLong
          ? `duration_seconds=${durationSeconds ?? 'unknown'}`
          : 'No recipe found',
        metadata: compensationMetadata(creditReservation, guestReservation, compensationPending),
      });

      if (compensationPending) {
        return compensationPendingResponse(platform, guestRemaining, creditReservation);
      }
      return jsonResponse({
        status,
        platform,
        code: rejectedAsTooLong ? 'video_too_long' : 'no_recipe',
        message: rejectedAsTooLong
          ? `This video is longer than ${formatMaxVideoDurationLabel()}. Try a shorter clip, or a post with the recipe written in the caption.`
          : platform === 'photo'
            ? "Couldn't find a recipe in this photo. Try a clearer picture of the ingredients and steps."
            : platform === 'web'
            ? "Couldn't find a recipe on this page. Try a different link."
            : "Couldn't find a recipe in this video. Try a different link.",
        tokens_charged: 0,
        ...quotaFields(snapshot),
        guest_extracts_remaining:
          guestInstallId && admin
            ? guestRemainingFromCount(await getGuestExtractCount(admin, guestInstallId))
            : guestRemaining,
      });
    }

    if (platform === 'photo' && imageBase64) {
      imageUrl = (await persistUploadedPhoto({ imageBase64, mimeType: imageMime })) ?? imageUrl;
    }

    const recipe = {
      title: gemini.title,
      source_language: normalizeLanguageCode(gemini.source_language),
      original_url: originalUrl,
      platform,
      image_url: imageUrl,
      source_video_url: sourceVideoUrl,
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

    let snapshot: QuotaSnapshot | null = creditReservation?.snapshot ?? null;

    if (userId && admin && creditReservation) {
      const finalized = await finalizeSignedInExtract(
        admin,
        userId,
        creditReservation.reservationId,
      );
      if (!finalized) {
        const compensated = await compensateSignedInExtract(
          admin,
          userId,
          creditReservation,
          'finalize_failed',
          true,
        );
        const failedReservation = creditReservation;
        compensationPending = !compensated;
        if (compensated) {
          creditReservation = null;
          snapshot = (await canStartExtract(admin, userId)).snapshot;
        }
        const code = compensationPending ? 'compensation_pending' : 'metering_error';
        await logUsageEvent(admin, {
          userId,
          action: 'extract',
          platform,
          status: code,
          extractionSource: source,
          usages,
          scrapecreatorsCredits: scrapeCredits,
          tokensCharged: 0,
          durationMs: Date.now() - started,
          errorMessage: code,
          metadata: {
            request_id: requestId,
            reservation_id: failedReservation.reservationId,
            credit_source: failedReservation.source,
            compensation_pending: compensationPending,
          },
        });
        return jsonResponse(
          {
            status: 'failed' as ExtractionStatus,
            platform,
            code,
            message: quotaBlockMessage(code),
            compensation_pending: compensationPending,
            tokens_charged: compensationPending ? 1 : 0,
            ...quotaFields(snapshot),
          },
          500,
        );
      }
    } else if (guestInstallId && admin && guestReservation) {
      const finalized = await finalizeGuestExtraction(
        admin,
        guestInstallId,
        guestReservation.reservationId,
      );
      if (!finalized) {
        const compensated = await compensateGuestExtraction(
          admin,
          guestInstallId,
          guestReservation,
          'finalize_failed',
        );
        compensationPending = !compensated;
        if (compensated) {
          guestReservation = null;
          guestRemaining = guestRemainingFromCount(await getGuestExtractCount(admin, guestInstallId));
        }
        await logUsageEvent(admin, {
          guestInstallId,
          action: 'extract',
          platform,
          status: compensationPending ? 'compensation_pending' : 'metering_error',
          extractionSource: source,
          usages,
          scrapecreatorsCredits: scrapeCredits,
          tokensCharged: 0,
          durationMs: Date.now() - started,
          errorMessage: 'guest_finalize_error',
          metadata: compensationMetadata(creditReservation, guestReservation, compensationPending),
        });
        return jsonResponse(
          {
            status: 'failed' as ExtractionStatus,
            platform,
            code: compensationPending ? 'compensation_pending' : 'metering_error',
            message: 'Could not verify your free extraction allowance. Please try again.',
            compensation_pending: compensationPending,
            guest_extracts_remaining: guestRemaining,
          },
          500,
        );
      }
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
      tokensCharged: userId ? 1 : 0,
      durationMs: Date.now() - started,
      metadata: creditReservation
        ? {
            ...quotaFields(snapshot),
            request_id: requestId,
            reservation_id: creditReservation.reservationId,
            credit_source: creditReservation.source,
          }
        : {},
    });

    return jsonResponse({
      status,
      platform,
      recipe,
      tokens_charged: userId ? 1 : 0,
      ...quotaFields(snapshot),
      guest_extracts_remaining: guestRemaining,
    });
  } catch (err) {
    console.error('extract-recipe error:', err);

    if (userId && creditReservation) {
      const refunded = await compensateSignedInExtract(
        admin,
        userId,
        creditReservation,
        'extraction_error',
      );
      compensationPending = !refunded;
      if (refunded) creditReservation = null;
    } else if (!userId && guestInstallId && guestReservation) {
      const refunded = await compensateGuestExtraction(
        admin,
        guestInstallId,
        guestReservation,
        'extraction_error',
      );
      compensationPending = !refunded;
      if (refunded) guestReservation = null;
    }

    // Failed extractions do not consume guest quota — re-read remaining for the client.
    if (!userId && guestInstallId && admin) {
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
      metadata: compensationMetadata(creditReservation, guestReservation, compensationPending),
    });

    if (compensationPending) {
      return compensationPendingResponse(platform, guestRemaining, creditReservation);
    }
    if (err instanceof FetchError) {
      const lower = err.message.toLowerCase();
      const message =
        lower.includes('not publicly accessible') ||
        lower.includes('too many requests') ||
        lower.includes('not found') ||
        lower.includes('invalid instagram') ||
        lower.includes('scrapecreators request failed') ||
        lower.includes('gemini request failed') ||
        lower.includes('openrouter request failed') ||
        lower.includes('could not load this webpage') ||
        lower.includes("couldn't read this page") ||
        lower.includes("doesn't look like a recipe webpage") ||
        lower.includes('webpage returned an error')
          ? err.message.includes('ScrapeCreators request failed')
            ? 'Instagram took too long to respond — try again.'
            : err.message.includes('timedOut=true')
              ? 'Recipe extraction timed out — try again in a moment.'
              : err.message
          : platform === 'web'
            ? "Couldn't load this page — try again."
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
        message:
          platform === 'web'
            ? 'Something went wrong while reading this page. Please try again.'
            : 'Something went wrong while reading the video. Please try again.',
        guest_extracts_remaining: guestRemaining,
      },
      500,
    );
  }
});

async function compensateSignedInExtract(
  admin: NonNullable<ReturnType<typeof createServiceSupabase>>,
  userId: string,
  reservation: CreditReservation,
  reason: string,
  afterFinalizeFailure = false,
): Promise<boolean> {
  const result = afterFinalizeFailure
    ? await refundSignedInExtractAfterFinalizeFailure(
        admin,
        userId,
        reservation.reservationId,
      )
    : await refundSignedInExtract(
        admin,
        userId,
        reservation.reservationId,
        reason,
      );
  if (result.confirmed) return true;

  const queued = await markSignedInExtractCompensationPending(
    admin,
    userId,
    reservation.reservationId,
    reason,
    result.error,
  );
  console.error('[extract-recipe] signed-in compensation pending', {
    reservationId: reservation.reservationId,
    reason,
    queued,
    error: result.error,
  });
  return false;
}

async function compensateGuestExtraction(
  admin: NonNullable<ReturnType<typeof createServiceSupabase>>,
  installId: string,
  reservation: GuestExtractionReservation,
  reason: string,
): Promise<boolean> {
  const result = await refundGuestExtraction(
    admin,
    installId,
    reservation.reservationId,
    reason,
  );
  if (result.confirmed) return true;

  const queued = await markGuestExtractionCompensationPending(
    admin,
    installId,
    reservation.reservationId,
    reason,
    result.error,
  );
  console.error('[extract-recipe] guest compensation pending', {
    reservationId: reservation.reservationId,
    reason,
    queued,
    error: result.error,
  });
  return false;
}

function compensationMetadata(
  signedIn: CreditReservation | null,
  guest: GuestExtractionReservation | null,
  pending: boolean,
): Record<string, unknown> {
  if (!pending) return {};
  return {
    compensation_pending: true,
    reservation_id: signedIn?.reservationId ?? guest?.reservationId ?? null,
    reservation_kind: signedIn ? 'signed_in' : 'guest',
  };
}

function compensationPendingResponse(
  platform: Platform,
  guestRemaining: number | null,
  signedInReservation: CreditReservation | null,
): Response {
  return jsonResponse(
    {
      status: 'failed' as ExtractionStatus,
      platform,
      code: 'compensation_pending',
      message: quotaBlockMessage('metering_error'),
      compensation_pending: true,
      tokens_charged: signedInReservation ? 1 : 0,
      guest_extracts_remaining: guestRemaining,
    },
    500,
  );
}

/** Buckets a Gemini result into full/failed/partial per the ADR 004 rules. */
function classify(r: GeminiRecipe): {
  status: Exclude<ExtractionStatus, 'coming_soon'>;
  missingFields: string[];
} {
  return classifyGeminiRecipe(r);
}

function quotaBlockMessage(code: string): string {
  return code === 'insufficient_credits' ? 'insufficient_credits' : 'metering_error';
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function hasTextSources(meta: PlatformMeta): boolean {
  return (
    Boolean(meta.description?.trim()) ||
    meta.topComments.length > 0 ||
    Boolean(meta.captions?.trim())
  );
}

async function reserveExtractCredits(opts: {
  admin: NonNullable<ReturnType<typeof createServiceSupabase>>;
  userId: string | null;
  guestInstallId: string | null;
  requestId: string;
  platform: Platform;
  started: number;
}): Promise<{
  creditReservation: CreditReservation | null;
  guestReservation: GuestExtractionReservation | null;
  guestRemaining: number | null;
  response?: Response;
}> {
  const { admin, userId, guestInstallId, requestId, platform, started } = opts;
  if (userId) {
    const reserved = await reserveSignedInExtract(admin, userId, requestId);
    if (!reserved.ok) {
      const code = reserved.code;
      await logUsageEvent(admin, {
        userId,
        action: 'extract',
        platform,
        status: code,
        tokensCharged: 0,
        durationMs: Date.now() - started,
        metadata: { request_id: requestId, ...quotaFields(reserved.snapshot) },
      });
      return {
        creditReservation: null,
        guestReservation: null,
        guestRemaining: null,
        response: jsonResponse(
          {
            status: 'failed' as ExtractionStatus,
            platform,
            code,
            message: quotaBlockMessage(code),
            ...quotaFields(reserved.snapshot),
          },
          code === 'metering_error' ? 500 : 402,
        ),
      };
    }
    return {
      creditReservation: reserved.reservation,
      guestReservation: null,
      guestRemaining: null,
    };
  }

  if (!guestInstallId) {
    return {
      creditReservation: null,
      guestReservation: null,
      guestRemaining: null,
      response: jsonResponse(
        {
          status: 'failed' as ExtractionStatus,
          platform,
          code: 'guest_id_required',
          message: 'Sign up to extract recipes, or update the app to continue as a guest.',
        },
        401,
      ),
    };
  }

  const reserved = await reserveGuestExtraction(admin, guestInstallId, requestId);
  if ('error' in reserved) {
    return {
      creditReservation: null,
      guestReservation: null,
      guestRemaining: null,
      response: jsonResponse(
        {
          status: 'failed' as ExtractionStatus,
          platform,
          code: 'metering_error',
          message: 'Could not verify your free extraction allowance. Please try again.',
        },
        500,
      ),
    };
  }
  if ('blocked' in reserved) {
    await logUsageEvent(admin, {
      guestInstallId,
      action: 'extract',
      platform,
      status: 'guest_limit',
      tokensCharged: 0,
      durationMs: Date.now() - started,
    });
    return {
      creditReservation: null,
      guestReservation: null,
      guestRemaining: 0,
      response: jsonResponse(
        {
          status: 'failed' as ExtractionStatus,
          platform,
          code: 'guest_limit',
          message: `You've used your ${GUEST_EXTRACT_LIMIT} free recipe extractions. Sign up to keep going.`,
          guest_extracts_remaining: 0,
        },
        429,
      ),
    };
  }
  return {
    creditReservation: null,
    guestReservation: reserved.reservation,
    guestRemaining: reserved.reservation.remaining,
  };
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
    case 'web':
      return await fetchWebRecipeMeta(url);
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

function normalizeLanguageCode(value: string | null | undefined): string {
  const normalized = value?.trim().toLowerCase().split(/[-_]/)[0];
  return normalized && /^[a-z]{2}$/.test(normalized) ? normalized : 'en';
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

  if (platform === 'web') {
    return meta.thumbnailUrl ?? null;
  }

  return meta.thumbnailUrl ?? null;
}
