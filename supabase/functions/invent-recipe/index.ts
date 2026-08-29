import { normalizeStoredCalories } from '../_shared/calories.ts';
import { classifyGeminiRecipe } from '../_shared/classifyRecipe.ts';
import {
  buildContentGateInput,
  runContentGate,
  shouldSkipThinSocialGate,
} from '../_shared/contentGate.ts';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { FetchError } from '../_shared/errors.ts';
import { inventRecipeFromImage, inventRecipeWithLadder } from '../_shared/inventRecipe.ts';
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
import { persistSocialThumbnail, persistUploadedPhoto, fetchImageAsBase64 } from '../_shared/persistThumbnail.ts';
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
import { createAuthedSupabase, extractVideoIdForPlatform, findExistingRecipeForUser } from '../_shared/recipeLookup.ts';
import { createServiceSupabase } from '../_shared/supabaseAdmin.ts';
import { normalizeRecipeTags } from '../_shared/tags.ts';
import { fetchTikTokMeta } from '../_shared/tiktok.ts';
import { logUsageEvent } from '../_shared/usageLog.ts';
import { isVideoTooLong } from '../_shared/videoLimits.ts';
import { fetchWebRecipeMeta } from '../_shared/webRecipe.ts';
import { fetchYouTubeMeta } from '../_shared/youtube.ts';

type JobStatus = 'full' | 'partial' | 'failed' | 'coming_soon';

/**
 * POST { url | image_base64, guest_install_id?, language? }
 * Invents a home-cook recipe after a food gate. Same 1-credit charge as Snap.
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
  let language = 'en';
  let alreadyGated = false;
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
    if (typeof body.language === 'string' && /^[a-z]{2}$/i.test(body.language.trim())) {
      language = body.language.trim().toLowerCase();
    }
    alreadyGated = body.already_gated === true || body.alreadyGated === true;
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  if (!url && !imageBase64) {
    return jsonResponse({ error: 'Missing "url" or "image_base64" in request body' }, 400);
  }

  const platform: Platform = imageBase64 ? 'photo' : detectPlatform(url);
  if (platform !== 'photo' && !LIVE_PLATFORMS.includes(platform)) {
    return jsonResponse({
      status: 'coming_soon' as JobStatus,
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
      status: 'failed' as JobStatus,
      platform,
      code: 'invalid_url',
      message: "That doesn't look like a valid YouTube video link.",
    });
  }
  if (platform === 'instagram' && !contentId) {
    return jsonResponse({
      status: 'failed' as JobStatus,
      platform,
      code: 'invalid_url',
      message: "That doesn't look like a valid Instagram reel or post link.",
    });
  }

  const admin = createServiceSupabase();
  const authHeader = req.headers.get('Authorization');
  let userId: string | null = null;
  let creditReservation: CreditReservation | null = null;
  let guestReservation: GuestExtractionReservation | null = null;
  let compensationPending = false;
  const authedClient = authHeader ? createAuthedSupabase(authHeader) : null;
  if (authedClient) {
    const {
      data: { user },
    } = await authedClient.auth.getUser();
    userId = user?.id ?? null;

    if (userId && admin && platform !== 'photo') {
      const existing = await findExistingRecipeForUser(
        authedClient,
        url,
        platform,
        contentId,
        'invented',
      );
      if (existing) {
        await logUsageEvent(admin, {
          userId,
          action: 'invent',
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
        status: 'failed' as JobStatus,
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
          status: 'failed' as JobStatus,
          platform,
          code: 'guest_id_required',
          message: 'Sign up to invent recipes, or update the app to continue as a guest.',
        },
        401,
      );
    }
  }

  try {
    let meta: PlatformMeta | null = null;
    let scrapeCredits = 0;
    let imageUrl: string | null = null;
    let sourceVideoUrl: string | null = null;
    let originalUrl: string | null = null;
    let durationSeconds: number | undefined;
    let usedInstagramVideoDownload = false;
    let videoSkippedReason: 'too_long' | undefined;

    if (platform !== 'photo') {
      meta = await fetchPlatformMeta(platform, url, contentId);
    }

    if (!admin) {
      return jsonResponse(
        { status: 'failed' as JobStatus, platform, code: 'metering_error', message: 'metering_error' },
        500,
      );
    }

    const skipGate =
      alreadyGated ||
      shouldSkipThinSocialGate({
        platform,
        imageBase64,
        contentId,
        meta,
      });

    const tooLongNoText =
      platform !== 'photo' &&
      platform !== 'web' &&
      isVideoTooLong(meta?.durationSeconds) &&
      !hasTextSources(meta ?? { topComments: [] });

    let gateKind: import('../_shared/contentGate.ts').ContentKind = alreadyGated ? 'plated_dish' : 'mixed';
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
            status: 'failed' as JobStatus,
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
            status: 'failed' as JobStatus,
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
        metadata: { kind: gate.kind, dish_guess: gate.dishGuess, job: 'invent' },
      });
    }

    if (gateKind === 'unrelated') {
      return jsonResponse({
        status: 'failed' as JobStatus,
        platform,
        code: 'not_food',
        message: imageBase64
          ? 'We can only invent recipes from food, drinks, or recipe photos.'
          : "That doesn't look like food or a recipe.",
        tokens_charged: 0,
      });
    }

    if (tooLongNoText && !imageBase64) {
      const thumbUrl =
        meta?.thumbnailUrl ?? (platform === 'youtube' && contentId ? youTubeThumbnail(contentId) : null);
      if (thumbUrl) {
        const fetched = await fetchImageAsBase64({
          sourceUrl: thumbUrl,
          referer: platform === 'instagram' ? 'https://www.instagram.com/' : platform === 'tiktok' ? 'https://www.tiktok.com/' : undefined,
        });
        if (fetched) {
          imageBase64 = fetched.base64;
          imageMime = fetched.mimeType;
        }
      }
    }

    if (userId) {
      const reserved = await reserveSignedInExtract(admin, userId, requestId);
      if (!reserved.ok) {
        return jsonResponse(
          {
            status: 'failed' as JobStatus,
            platform,
            code: reserved.code,
            message: quotaBlockMessage(reserved.code),
            ...quotaFields(reserved.snapshot),
          },
          reserved.code === 'metering_error' ? 500 : 402,
        );
      }
      creditReservation = reserved.reservation;
    } else if (guestInstallId) {
      const reserved = await reserveGuestExtraction(admin, guestInstallId, requestId);
      if ('error' in reserved) {
        return jsonResponse(
          {
            status: 'failed' as JobStatus,
            platform,
            code: 'metering_error',
            message: 'Could not verify your free extraction allowance. Please try again.',
          },
          500,
        );
      }
      if ('blocked' in reserved) {
        return jsonResponse(
          {
            status: 'failed' as JobStatus,
            platform,
            code: 'guest_limit',
            message: `You've used your ${GUEST_EXTRACT_LIMIT} free recipe extractions. Sign up to keep going.`,
            guest_extracts_remaining: 0,
          },
          429,
        );
      }
      guestReservation = reserved.reservation;
      guestRemaining = guestReservation.remaining;
    }

    let gemini;
    let usages: import('../_shared/pricing.ts').GeminiUsageSnapshot[] = [];

    if (imageBase64 && (platform === 'photo' || tooLongNoText)) {
      const fromImage = await inventRecipeFromImage({
        imageBase64,
        mimeType: imageMime,
        language,
      });
      gemini = fromImage.recipe;
      if (fromImage.usage) usages = [fromImage.usage];
      if (platform === 'photo') {
        originalUrl = null;
      } else {
        const resolvedContentId = meta?.contentId ?? contentId;
        originalUrl = canonicalOriginalUrl(platform, resolvedContentId, url);
        imageUrl = await resolveThumbnail(platform, resolvedContentId, meta ?? { topComments: [] });
      }
    } else {
      const ladder = await inventRecipeWithLadder(
        {
          platform,
          sourceUrl: url,
          videoUrl: platform === 'web' ? undefined : meta?.videoUrl,
          durationSeconds: platform === 'web' ? undefined : meta?.durationSeconds,
          description: meta?.description,
          captions: meta?.captions,
          topComments: meta?.topComments ?? [],
        },
        language,
      );
      gemini = ladder.recipe;
      usages = ladder.usages;
      usedInstagramVideoDownload = ladder.usedInstagramVideoDownload === true;
      videoSkippedReason = ladder.videoSkippedReason;
      scrapeCredits = estimateScrapeCredits(platform, usedInstagramVideoDownload);
      const resolvedContentId = meta?.contentId ?? contentId;
      imageUrl = await resolveThumbnail(platform, resolvedContentId, meta ?? { topComments: [] });
      sourceVideoUrl = platform === 'web' ? meta?.videoUrl ?? null : null;
      originalUrl = canonicalOriginalUrl(platform, resolvedContentId, url);
      durationSeconds = meta?.durationSeconds;
    }

    const { status, missingFields } = classifyGeminiRecipe(gemini);
    if (status === 'failed') {
      if (userId && creditReservation) {
        const refunded = await compensateSignedIn(
          admin,
          userId,
          creditReservation,
          videoSkippedReason === 'too_long' ? 'video_too_long' : 'no_recipe_found',
        );
        compensationPending = !refunded;
        if (refunded) creditReservation = null;
      } else if (guestInstallId && guestReservation) {
        const refunded = await compensateGuest(
          admin,
          guestInstallId,
          guestReservation,
          videoSkippedReason === 'too_long' ? 'video_too_long' : 'no_recipe_found',
        );
        compensationPending = !refunded;
        if (refunded) guestReservation = null;
      }

      let snapshot: QuotaSnapshot | null = null;
      if (userId) snapshot = (await canStartExtract(admin, userId)).snapshot;
      await logUsageEvent(admin, {
        userId,
        guestInstallId: userId ? null : guestInstallId,
        action: 'invent',
        platform,
        status: 'failed',
        usages,
        scrapecreatorsCredits: scrapeCredits,
        tokensCharged: 0,
        durationMs: Date.now() - started,
        errorMessage: 'No recipe invented',
        metadata: { duration_seconds: durationSeconds ?? null },
      });
      if (compensationPending) {
        return compensationPendingResponse(platform, guestRemaining, creditReservation);
      }
      return jsonResponse({
        status: 'failed' as JobStatus,
        platform,
        code: videoSkippedReason === 'too_long' ? 'video_too_long' : 'no_recipe',
        message: "Couldn't invent a recipe from that. Try a clearer photo of the dish.",
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
      source_language: normalizeLanguageCode(gemini.source_language) || language,
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
      extraction_source: 'invented' as const,
      calories_reasoning: gemini.calories_reasoning?.trim() || null,
      time_reasoning: gemini.time_reasoning?.trim() || null,
      tags: normalizeRecipeTags(gemini.tags),
      missing_fields: missingFields,
    };

    let snapshot: QuotaSnapshot | null = creditReservation?.snapshot ?? null;
    if (userId && creditReservation) {
      const finalized = await finalizeSignedInExtract(admin, userId, creditReservation.reservationId);
      if (!finalized) {
        const compensated = await compensateSignedIn(admin, userId, creditReservation, 'finalize_failed', true);
        compensationPending = !compensated;
        if (compensated) {
          creditReservation = null;
          snapshot = (await canStartExtract(admin, userId)).snapshot;
        }
        return jsonResponse(
          {
            status: 'failed' as JobStatus,
            platform,
            code: compensationPending ? 'compensation_pending' : 'metering_error',
            message: quotaBlockMessage('metering_error'),
            compensation_pending: compensationPending,
            tokens_charged: compensationPending ? 1 : 0,
            ...quotaFields(snapshot),
          },
          500,
        );
      }
    } else if (guestInstallId && guestReservation) {
      const finalized = await finalizeGuestExtraction(
        admin,
        guestInstallId,
        guestReservation.reservationId,
      );
      if (!finalized) {
        const compensated = await compensateGuest(admin, guestInstallId, guestReservation, 'finalize_failed');
        compensationPending = !compensated;
        if (compensated) {
          guestReservation = null;
          guestRemaining = guestRemainingFromCount(await getGuestExtractCount(admin, guestInstallId));
        }
        return jsonResponse(
          {
            status: 'failed' as JobStatus,
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
      action: 'invent',
      platform,
      status,
      extractionSource: 'invented',
      usages,
      scrapecreatorsCredits: scrapeCredits,
      tokensCharged: userId ? 1 : 0,
      durationMs: Date.now() - started,
    });

    return jsonResponse({
      status,
      platform,
      recipe,
      dish_guess: dishGuess,
      tokens_charged: userId ? 1 : 0,
      ...quotaFields(snapshot),
      guest_extracts_remaining: guestRemaining,
    });
  } catch (err) {
    console.error('invent-recipe error:', err);
    if (userId && creditReservation && admin) {
      const refunded = await compensateSignedIn(admin, userId, creditReservation, 'invent_error');
      compensationPending = !refunded;
      if (refunded) creditReservation = null;
    } else if (!userId && guestInstallId && guestReservation && admin) {
      const refunded = await compensateGuest(admin, guestInstallId, guestReservation, 'invent_error');
      compensationPending = !refunded;
      if (refunded) guestReservation = null;
    }
    if (!userId && guestInstallId && admin) {
      guestRemaining = guestRemainingFromCount(await getGuestExtractCount(admin, guestInstallId));
    }
    await logUsageEvent(admin, {
      userId,
      guestInstallId: userId ? null : guestInstallId,
      action: 'invent',
      platform,
      status: 'error',
      tokensCharged: 0,
      durationMs: Date.now() - started,
      errorMessage: (err instanceof Error ? err.message : String(err)).slice(0, 500),
    });
    if (compensationPending) {
      return compensationPendingResponse(platform, guestRemaining, creditReservation);
    }
    if (err instanceof FetchError) {
      return jsonResponse(
        {
          status: 'failed' as JobStatus,
          platform,
          message: "Couldn't invent a recipe from that. Try again in a moment.",
          guest_extracts_remaining: guestRemaining,
        },
        502,
      );
    }
    return jsonResponse(
      {
        status: 'failed' as JobStatus,
        platform,
        message: 'Something went wrong while inventing this recipe. Please try again.',
        guest_extracts_remaining: guestRemaining,
      },
      500,
    );
  }
});

async function compensateSignedIn(
  admin: NonNullable<ReturnType<typeof createServiceSupabase>>,
  userId: string,
  reservation: CreditReservation,
  reason: string,
  afterFinalizeFailure = false,
): Promise<boolean> {
  const result = afterFinalizeFailure
    ? await refundSignedInExtractAfterFinalizeFailure(admin, userId, reservation.reservationId)
    : await refundSignedInExtract(admin, userId, reservation.reservationId, reason);
  if (result.confirmed) return true;
  await markSignedInExtractCompensationPending(
    admin,
    userId,
    reservation.reservationId,
    reason,
    result.error,
  );
  return false;
}

async function compensateGuest(
  admin: NonNullable<ReturnType<typeof createServiceSupabase>>,
  installId: string,
  reservation: GuestExtractionReservation,
  reason: string,
): Promise<boolean> {
  const result = await refundGuestExtraction(admin, installId, reservation.reservationId, reason);
  if (result.confirmed) return true;
  await markGuestExtractionCompensationPending(
    admin,
    installId,
    reservation.reservationId,
    reason,
    result.error,
  );
  return false;
}

function compensationPendingResponse(
  platform: Platform,
  guestRemaining: number | null,
  signedInReservation: CreditReservation | null,
): Response {
  return jsonResponse(
    {
      status: 'failed' as JobStatus,
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

function normalizeLanguageCode(value: string | null | undefined): string {
  const normalized = value?.trim().toLowerCase().split(/[-_]/)[0];
  return normalized && /^[a-z]{2}$/.test(normalized) ? normalized : 'en';
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
    return hosted ?? meta.thumbnailUrl;
  }
  return meta.thumbnailUrl ?? null;
}
