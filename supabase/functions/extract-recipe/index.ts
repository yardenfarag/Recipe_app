import { serve } from '../_shared/core/observe.ts';
import { normalizeStoredCalories } from '../_shared/recipes/calories.ts';
import { corsHeaders, jsonResponse } from '../_shared/core/cors.ts';
import { FetchError } from '../_shared/core/errors.ts';
import { fetchErrorInfo } from '../_shared/extraction/fetchErrorMessage.ts';
import { classifyGeminiRecipe } from '../_shared/extraction/classifyRecipe.ts';
import {
  buildContentGateInput,
  runContentGate,
  shouldSkipThinSocialGate,
} from '../_shared/extraction/contentGate.ts';
import {
  beginTextExtraction,
  extractRecipeFromImage,
  extractRecipeWithLadder,
  type ExtractInput,
  GeminiRecipe,
} from '../_shared/extraction/gemini.ts';
import { fetchFacebookMeta, resolveFacebookShareLink } from '../_shared/extraction/sources/facebook.ts';
import { fetchInstagramMeta } from '../_shared/extraction/sources/instagram.ts';
import {
  appliedExtractRoute,
  decideExtractRoute,
  type ExtractGateDecision,
  type ExtractRoute,
  shouldRunExtractGate,
  skipsTextStep,
} from '../_shared/llm/jev.ts';
import {
  canonicalFacebookUrl,
  canonicalInstagramUrl,
  canonicalTikTokUrl,
  canonicalYouTubeWatchUrl,
  detectPlatform,
  LIVE_PLATFORMS,
  type Platform,
  youTubeThumbnail,
} from '../_shared/extraction/platform.ts';
import type { PlatformMeta } from '../_shared/extraction/platformMeta.ts';
import { keepUploadedPhoto, persistSocialThumbnail } from '../_shared/extraction/persistThumbnail.ts';
import {
  type DecodedPdf,
  decodePdfBase64,
  extractRecipeFromPdf,
  pdfRejectMessage,
  type PdfRejectCode,
  type PdfRoute,
  type PdfText,
  readPdfText,
  scannedPageCount,
} from '../_shared/extraction/pdfRecipe.ts';
import { reserveDailyAiUsage } from '../_shared/core/dailyAiUsage.ts';
import {
  CONTENT_GATE_DAILY_LIMIT,
  estimateScrapeCredits,
  GUEST_EXTRACT_LIMIT,
} from '../_shared/llm/pricing.ts';
import {
  canStartExtract,
  CREDIT_REPLAY_WINDOW_MS,
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
} from '../_shared/core/quotas.ts';
import { appliancesForRecipe } from '../_shared/recipes/enrich/recipeAppliances.ts';
import {
  createAuthedSupabase,
  extractVideoIdForPlatform,
  findExistingRecipeForUser,
} from '../_shared/core/recipeLookup.ts';
import { createServiceSupabase } from '../_shared/core/supabaseAdmin.ts';
import { normalizeRecipeTags } from '../_shared/recipes/tags.ts';
import { fitRecipeToLimits } from '../_shared/recipes/recipeLimits.ts';
import { fetchTikTokMeta } from '../_shared/extraction/sources/tiktok.ts';
import { logUsageEvent } from '../_shared/core/usageLog.ts';
import { formatMaxVideoDurationLabel, isVideoTooLong } from '../_shared/extraction/videoLimits.ts';
import { fetchWebRecipeMeta } from '../_shared/extraction/webRecipe.ts';
import { pageReadLogger, type PageReadEvent } from '../_shared/extraction/pageReader.ts';
import { fetchYouTubeMeta } from '../_shared/extraction/sources/youtube.ts';
import {
  fillRecipeCardDiets,
  findRecipeCard,
  hubCardToExtractRecipe,
  publishRecipeCard,
  touchRecipeCardHit,
  userContributesToHub,
} from '../_shared/recipes/recipeCards.ts';

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

// Response contract consumed by the app (mirrors ExtractionResult in ADR 004).
type ExtractionStatus = 'full' | 'partial' | 'failed' | 'coming_soon';

/**
 * Supabase answers 504 when a request sends nothing for 150 s, and the app then can't tell
 * whether the credit was spent. Every extraction answers by this point instead.
 */
const RESPONSE_DEADLINE_MS = 138_000;
/** Kept free after the ladder for the thumbnail, appliances, the credit and the Hub. */
const AFTER_LADDER_MS = 22_000;
/** Below this much time left, the appliance call is skipped (ADR 017: saved as not analysed). */
const MIN_APPLIANCES_MS = 8_000;
/** Below this much time left, a social thumbnail isn't copied to Storage; the CDN URL is kept. */
const MIN_THUMBNAIL_COPY_MS = 15_000;

/**
 * POST { url | image_base64 | pdf_base64, guest_install_id? } -> { status, platform, recipe?, message?, cached?, ... }
 *
 * A PDF (PIN-72) imports like a photo: platform `photo`, one credit, never published to the Hub.
 *
 * Detects the platform, rejects anything not yet live (ADR 003), then for
 * YouTube: returns an existing saved recipe when the URL is already in the
 * user's library, otherwise runs the content ladder (description → comments →
 * captions → video) before classifying the result.
 *
 * Guests get `auth_required` and must sign up first. Signed-in users receive
 * 10 monthly credits and can spend non-expiring purchased credits after those.
 * Cached URL re-extract is free, and so is a partial result (ADR 019).
 */
serve('extract-recipe', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const started = Date.now();
  const deadlineAt = started + RESPONSE_DEADLINE_MS;
  const ladderDeadlineAt = deadlineAt - AFTER_LADDER_MS;
  let url = '';
  let imageBase64: string | null = null;
  let imageMime = 'image/jpeg';
  let pdf: DecodedPdf | null = null;
  let guestInstallId: string | null = null;
  let requestId: string = crypto.randomUUID();
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
    const rawPdf = body.pdf_base64 ?? body.pdfBase64;
    if (!imageBase64 && typeof rawPdf === 'string' && rawPdf.trim().length > 80) {
      const decoded = decodePdfBase64(rawPdf);
      if (!decoded.ok) return pdfRejectResponse(decoded.code);
      pdf = decoded.pdf;
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

  if (!url && !imageBase64 && !pdf) {
    return jsonResponse({ error: 'Missing "url", "image_base64" or "pdf_base64" in request body' }, 400);
  }

  const platform: Platform = imageBase64 || pdf ? 'photo' : detectPlatform(url);

  // ADR 003 — staged rollout: reject non-live platforms with a clear message.
  if (platform !== 'photo' && !LIVE_PLATFORMS.includes(platform)) {
    return jsonResponse({
      status: 'coming_soon' as ExtractionStatus,
      platform,
      message:
        platform === 'unknown'
          ? "We couldn't recognize that link. Try a YouTube, Instagram, TikTok, Facebook, or recipe website link."
          : `${capitalize(platform)} support is coming soon — we're starting with YouTube.`,
    });
  }

  const authHeader = req.headers.get('Authorization');
  if (platform === 'facebook' && authHeader) {
    // PIN-66: a share link only names its reel or post after a redirect. Resolving it here lets
    // the saved-recipe check below recognise a repeat before any scrape is paid for.
    url = await resolveFacebookShareLink(url);
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
        return await savedRecipeResponse({ admin, existing, platform, userId, started });
      }
    }

    if (admin && !forceExtract && platform !== 'photo') {
      const hubCard = await findRecipeCard(admin, platform, url, contentId);
      if (hubCard) {
        return await recipeCardHitResponse({
          admin,
          card: hubCard,
          platform,
          userId,
          started,
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
    return jsonResponse(
      {
        status: 'failed' as ExtractionStatus,
        platform,
        code: 'auth_required',
        message: 'Sign up to extract recipes.',
      },
      401,
    );
  }

  // No credits: say so now, before the scrape and model calls below cost anything. The
  // reservation further down is still the real check (credits can run out in between).
  if (admin) {
    const precheck = await canStartExtract(admin, userId);
    if (!precheck.ok && precheck.code === 'insufficient_credits') {
      await logUsageEvent(admin, {
        userId,
        action: 'extract',
        platform,
        status: 'insufficient_credits',
        tokensCharged: 0,
        durationMs: Date.now() - started,
        metadata: { request_id: requestId, precheck: true },
      });
      return jsonResponse(
        {
          status: 'failed' as ExtractionStatus,
          platform,
          code: 'insufficient_credits',
          message: quotaBlockMessage('insufficient_credits'),
          ...quotaFields(precheck.snapshot),
        },
        402,
      );
    }
  }

  // A PDF's pages and text are read before anything is charged: too many pages, or one that won't open, is
  // turned away here.
  let pdfText: PdfText | null = null;
  let pdfRoute: PdfRoute | null = null;
  if (pdf) {
    const read = await readPdfText(pdf.bytes);
    if (!read.ok) {
      if (admin) {
        await logUsageEvent(admin, {
          userId,
          action: 'extract',
          platform,
          status: 'failed',
          tokensCharged: 0,
          durationMs: Date.now() - started,
          errorMessage: read.code,
          metadata: { request_id: requestId, input: 'pdf', pdf_bytes: pdf.bytes.length },
        });
      }
      return pdfRejectResponse(read.code);
    }
    pdfText = read.text;
  }

  // Every uploaded photo is kept, whatever the outcome, until the account is deleted.
  const uploadedPhoto = keepUploadedPhoto(platform, imageBase64, imageMime, userId);

  try {
    console.log('[extract-recipe] start', {
      platform,
      url: url || null,
      hasImage: Boolean(imageBase64),
      pdfPages: pdfText?.pageCount ?? null,
      contentId,
      userId: Boolean(userId),
    });

    let gemini: GeminiRecipe;
    let source: 'description' | 'comments' | 'captions' | 'video' | 'web' | 'photo';
    let usages: import('../_shared/llm/pricing.ts').GeminiUsageSnapshot[] = [];
    let usedInstagramVideoDownload = false;
    let videoSkippedReason: 'too_long' | 'out_of_time' | undefined;
    let scrapeCredits = 0;
    let imageUrl: string | null = null;
    let sourceVideoUrl: string | null = null;
    let originalUrl: string | null = null;
    let durationSeconds: number | undefined;
    let meta: PlatformMeta | null = null;

    if (platform !== 'photo') {
      meta = await fetchPlatformMeta(
        platform,
        url,
        contentId,
        pageReadLogger(admin, { userId, guestInstallId, forAction: 'extract' }),
      );
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

      const resolvedId = meta.contentId ?? contentId;
      if (admin && authedClient && resolvedId && resolvedId !== contentId) {
        // The link had no id (a share or short link), so the first saved-recipe check could not
        // match. Check again now the post has named itself, before a credit is reserved.
        const existing = await findExistingRecipeForUser(
          authedClient,
          meta.canonicalUrl ?? url,
          platform,
          resolvedId,
        );
        if (existing) {
          return await savedRecipeResponse({ admin, existing, platform, userId, started });
        }
      }
      if (admin && !forceExtract && resolvedId && resolvedId !== contentId) {
        const hubCard = await findRecipeCard(admin, platform, url, resolvedId);
        if (hubCard) {
          return await recipeCardHitResponse({
            admin,
            card: hubCard,
            platform,
            userId,
            started,
          });
        }
      }
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

    const ladderInput: ExtractInput | null =
      platform === 'photo'
        ? null
        : {
            platform,
            sourceUrl: url,
            videoUrl: platform === 'web' ? undefined : meta?.videoUrl,
            durationSeconds: platform === 'web' ? undefined : meta?.durationSeconds,
            description: meta?.description,
            captions: meta?.captions,
            topComments: meta?.topComments ?? [],
          };
    // Jev routes the post (~0.3 s) before the slow text call, alongside the food check.
    // Any error or low-confidence answer leaves today's ladder unchanged.
    const extractGate =
      ladderInput && shouldRunExtractGate(ladderInput) ? decideExtractRoute(ladderInput) : null;
    // Overlap the text model call with the food check. Video stays behind the gate.
    const pendingText = ladderInput
      ? (extractGate ?? Promise.resolve(null)).then((decision) => {
          const route = appliedExtractRoute(decision);
          if (route === 'no_recipe' && !forceExtract) return null;
          if (skipsTextStep(route, ladderInput)) return null;
          return beginTextExtraction(ladderInput, ladderDeadlineAt);
        })
      : null;

    // A PDF skips the food check: it can't send a PDF, and there is no Guess the recipe from a PDF to hand off to.
    // Reading it is the check (no recipe found is free). It still takes one of the check's daily slots, so PDFs
    // with no recipe are capped like photos with none.
    const skipGate = pdf !== null || shouldSkipThinSocialGate({
      platform,
      imageBase64,
      contentId,
      meta,
    });

    let gateKind: import('../_shared/extraction/contentGate.ts').ContentKind = 'mixed';
    let dishGuess = '';

    if (pdf) {
      const slot = await reserveDailyAiUsage(admin, userId, 'content_gate', CONTENT_GATE_DAILY_LIMIT);
      if (slot !== 'ok') {
        await logUsageEvent(admin, {
          userId,
          action: 'content_gate',
          platform,
          status: slot === 'limited' ? 'daily_limit' : 'error',
          tokensCharged: 0,
          durationMs: Date.now() - started,
          metadata: { input: 'pdf', job: 'extract' },
        });
        return slot === 'limited'
          ? jsonResponse(
            { status: 'failed' as ExtractionStatus, platform, code: 'daily_limit', message: 'daily_limit' },
            429,
          )
          : jsonResponse(
            {
              status: 'failed' as ExtractionStatus,
              platform,
              code: 'gate_unavailable',
              message: 'Could not check if this is food. Please try again.',
            },
            503,
          );
      }
    }

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

    let extractRoute: ExtractRoute | null = null;
    let skipText = false;
    if (extractGate && ladderInput) {
      const decision = await extractGate;
      extractRoute = appliedExtractRoute(decision);
      skipText = skipsTextStep(extractRoute, ladderInput);
      await logExtractGate(admin, { decision, userId, platform, requestId, skipText, forceExtract });
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

    if (extractRoute === 'no_recipe' && !forceExtract) {
      await logUsageEvent(admin, {
        userId,
        action: 'extract',
        platform,
        status: 'failed',
        tokensCharged: 0,
        durationMs: Date.now() - started,
        errorMessage: 'extract_gate: no_recipe',
        metadata: { request_id: requestId, extract_route: extractRoute },
      });
      // looks_like_dish, not no_recipe: shipped apps only offer "Extract anyway"
      // (force_extract, which skips Jev) for that code, so a misroute has a way out.
      return jsonResponse({
        status: 'failed' as ExtractionStatus,
        platform,
        code: 'looks_like_dish',
        dish_guess: dishGuess,
        message: "Couldn't find a recipe in this post's text.",
        tokens_charged: 0,
        ...quotaFields((await canStartExtract(admin, userId)).snapshot),
      });
    }

    const reserved = await reserveExtractCredits({
      admin,
      userId,
      guestInstallId,
      requestId,
      // The credit pays for this link or photo only; a reused request id can't buy another.
      scope: imageBase64
        ? `photo|${imageBase64}`
        : pdf
        ? `pdf|${pdf.base64}`
        : `${platform}|${meta?.contentId ?? contentId ?? url}`,
      platform,
      started,
    });
    if (reserved.response) return reserved.response;
    creditReservation = reserved.creditReservation;
    guestReservation = reserved.guestReservation;
    guestRemaining = reserved.guestRemaining;

    if (pdf && pdfText) {
      const fromPdf = await extractRecipeFromPdf({ pdf, text: pdfText, deadlineAt: ladderDeadlineAt });
      gemini = fromPdf.recipe;
      usages = fromPdf.usages;
      source = 'photo';
      originalUrl = null;
      pdfRoute = fromPdf.route;
      // Same answer as a video cut short: refunded, and the app says to try again.
      if (fromPdf.fileSkipped) videoSkippedReason = 'out_of_time';
      console.log('[extract-recipe] pdf done', {
        route: fromPdf.route,
        foundRecipe: gemini.found_recipe,
        ingredients: gemini.ingredients?.length ?? 0,
        instructions: gemini.instructions?.length ?? 0,
      });
    } else if (platform === 'photo' && imageBase64) {
      const fromImage = await extractRecipeFromImage({
        imageBase64,
        mimeType: imageMime,
      });
      gemini = fromImage.recipe;
      if (fromImage.usage) usages = [fromImage.usage];
      source = 'photo';
      originalUrl = null;
    } else {
      const ladder = await extractRecipeWithLadder(ladderInput!, {
        pendingText,
        skipText,
        deadlineAt: ladderDeadlineAt,
      });
      gemini = ladder.recipe;
      source = ladder.source;
      usages = ladder.usages;
      usedInstagramVideoDownload = ladder.usedInstagramVideoDownload === true;
      videoSkippedReason = ladder.videoSkippedReason;
      scrapeCredits = estimateScrapeCredits(platform, usedInstagramVideoDownload) + (meta?.scrapeCredits ?? 0);
      const resolvedContentId = meta?.contentId ?? contentId;
      imageUrl = deadlineAt - Date.now() >= MIN_THUMBNAIL_COPY_MS
        ? await resolveThumbnail(platform, resolvedContentId, meta ?? { topComments: [] })
        : (meta?.thumbnailUrl ??
          (platform === 'youtube' && resolvedContentId ? youTubeThumbnail(resolvedContentId) : null));
      sourceVideoUrl = platform === 'web' ? meta?.videoUrl ?? null : null;
      originalUrl = canonicalOriginalUrl(platform, resolvedContentId, url, meta?.canonicalUrl);
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
      const ranOutOfTime = videoSkippedReason === 'out_of_time';
      if (userId && creditReservation) {
        const refunded = await compensateSignedInExtract(
          admin,
          userId,
          creditReservation,
          rejectedAsTooLong ? 'video_too_long' : ranOutOfTime ? 'out_of_time' : 'no_recipe_found',
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
        status: rejectedAsTooLong ? 'video_too_long' : ranOutOfTime ? 'out_of_time' : 'failed',
        extractionSource: source,
        usages,
        scrapecreatorsCredits: scrapeCredits,
        tokensCharged: 0,
        durationMs: Date.now() - started,
        errorMessage: rejectedAsTooLong
          ? `duration_seconds=${durationSeconds ?? 'unknown'}`
          : ranOutOfTime
          ? `out_of_time duration_seconds=${durationSeconds ?? 'unknown'}`
          : 'No recipe found',
        metadata: {
          ...compensationMetadata(creditReservation, guestReservation, compensationPending),
          ...extractRouteMetadata(extractGate, extractRoute, requestId),
          ...videoMetadata(durationSeconds, usedInstagramVideoDownload),
          ...pdfMetadata(pdf, pdfText, pdfRoute),
        },
      });

      if (compensationPending) {
        return compensationPendingResponse(platform, guestRemaining, creditReservation);
      }
      return jsonResponse({
        status,
        platform,
        // A PDF gets its own code: `no_recipe` makes the apps offer Guess the recipe, which a PDF can't do.
        code: rejectedAsTooLong
          ? 'video_too_long'
          : ranOutOfTime
          ? (pdf ? 'pdf_timed_out' : 'extraction_timeout')
          : pdf
          ? 'pdf_no_recipe'
          : 'no_recipe',
        message: rejectedAsTooLong
          ? `This video is longer than ${formatMaxVideoDurationLabel()}. Try a shorter clip, or a post with the recipe written in the caption.`
          : ranOutOfTime && pdf
          ? 'This PDF took too long to read. Your credit was not used. Try again in a moment.'
          : ranOutOfTime
          ? 'This video took too long to read. Your credit was not used. Try again in a moment, or use a post with the recipe in the caption.'
          : pdf
          ? "Couldn't find a recipe in this PDF. Try one with the recipe's ingredients and steps."
          : platform === 'photo'
            ? "Couldn't find a recipe in this photo. Try a clearer picture of the ingredients and steps."
            : platform === 'web'
            ? "Couldn't find a recipe on this page. Try a different link."
            : platform === 'facebook'
            ? "Couldn't find a recipe in this post. Try a different link."
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
      imageUrl = (await uploadedPhoto) ?? imageUrl;
    }

    // ADR 019: a partial import is free and goes to the editor, whose Save recalculates
    // appliances, so don't spend a model call on them here.
    const isPartial = status === 'partial';

    // ADR 017: never throws; a failure saves as "not analysed" (null).
    // Two sequential calls share what's left before the deadline; too little left, and the
    // recipe saves as "not analysed", which the editor's Save fills in later.
    const appliancesMs = deadlineAt - Date.now() - 3_000;
    const { appliances, metadata: applianceMetadata } = isPartial
      ? { appliances: null, metadata: {} }
      : appliancesMs < MIN_APPLIANCES_MS
      ? { appliances: null, metadata: { appliances_skipped: 'out_of_time' } }
      : await appliancesForRecipe(gemini, usages, {
          timeoutMs: Math.min(15_000, Math.floor(appliancesMs / 2)),
        });

    const recipe = fitRecipeToLimits({
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
      appliances,
    });

    let snapshot: QuotaSnapshot | null = creditReservation?.snapshot ?? null;

    if (isPartial) {
      // ADR 019: a partial import never costs a credit or a guest import, like a failed find.
      if (userId && creditReservation) {
        const refunded = await compensateSignedInExtract(admin, userId, creditReservation, 'partial_import');
        compensationPending = !refunded;
        if (refunded) creditReservation = null;
      } else if (guestInstallId && guestReservation) {
        const refunded = await compensateGuestExtraction(admin, guestInstallId, guestReservation, 'partial_import');
        compensationPending = !refunded;
        if (refunded) guestReservation = null;
      }
      if (compensationPending) {
        await logUsageEvent(admin, {
          userId,
          guestInstallId: userId ? null : guestInstallId,
          action: 'extract',
          platform,
          status: 'compensation_pending',
          extractionSource: source,
          usages,
          scrapecreatorsCredits: scrapeCredits,
          tokensCharged: 0,
          durationMs: Date.now() - started,
          errorMessage: 'partial_import',
          metadata: compensationMetadata(creditReservation, guestReservation, compensationPending),
        });
        return compensationPendingResponse(platform, guestRemaining, creditReservation);
      }
      if (userId && admin) snapshot = (await canStartExtract(admin, userId)).snapshot;
      if (!userId && guestInstallId && admin) {
        guestRemaining = guestRemainingFromCount(await getGuestExtractCount(admin, guestInstallId));
      }
    } else if (userId && admin && creditReservation) {
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
      tokensCharged: userId && !isPartial ? 1 : 0,
      durationMs: Date.now() - started,
      metadata: {
        ...(creditReservation
          ? {
              ...quotaFields(snapshot),
              request_id: requestId,
              reservation_id: creditReservation.reservationId,
              credit_source: creditReservation.source,
            }
          : {}),
        ...extractRouteMetadata(extractGate, extractRoute, requestId),
        ...videoMetadata(durationSeconds, usedInstagramVideoDownload),
        ...pdfMetadata(pdf, pdfText, pdfRoute),
        ...applianceMetadata,
      },
    });

    if (status === 'full' && admin) {
      // Publishing to the Hub includes a moderation check (PIN-153) and then the diet check
      // (PIN-83), each a model call. Both run after the response, so they never slow the
      // extract down; the user's own recipe doesn't depend on either.
      const publishToHub = async () => {
        if (userId && !(await userContributesToHub(admin, userId))) return;
        const card = await publishRecipeCard(admin, recipe, meta?.contentId ?? contentId, { userId });
        if (card?.needsDiets) await fillRecipeCardDiets(admin, card.id, recipe, userId ?? null);
      };
      const publishing = publishToHub().catch((error) =>
        console.error('[extract-recipe] hub publish failed', error)
      );
      if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(publishing);
      else await publishing;
    }

    return jsonResponse({
      status,
      platform,
      recipe,
      tokens_charged: userId && !isPartial ? 1 : 0,
      ...quotaFields(snapshot),
      guest_extracts_remaining: guestRemaining,
    });
  } catch (err) {
    console.error('extract-recipe error:', err);

    if (admin && userId && creditReservation) {
      const refunded = await compensateSignedInExtract(
        admin,
        userId,
        creditReservation,
        'extraction_error',
      );
      compensationPending = !refunded;
      if (refunded) creditReservation = null;
    } else if (admin && !userId && guestInstallId && guestReservation) {
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
      metadata: {
        ...compensationMetadata(creditReservation, guestReservation, compensationPending),
        ...pdfMetadata(pdf, pdfText, pdfRoute),
      },
    });

    if (compensationPending) {
      return compensationPendingResponse(platform, guestRemaining, creditReservation);
    }
    if (err instanceof FetchError) {
      // The app translates by `code`; `message` is for builds that don't know the code yet.
      const { code, message } = fetchErrorInfo(err, platform);
      return jsonResponse(
        {
          status: 'failed' as ExtractionStatus,
          platform,
          code,
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
        code: 'try_again',
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
  // A replay rides on a credit that already bought this recipe: there is nothing to give back.
  if (reservation.replayed) return true;
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
    { afterFinalizeFailure },
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

async function logExtractGate(
  admin: NonNullable<ReturnType<typeof createServiceSupabase>>,
  opts: {
    decision: ExtractGateDecision;
    userId: string;
    platform: Platform;
    requestId: string;
    skipText: boolean;
    forceExtract: boolean;
  },
): Promise<void> {
  const { decision, userId, platform, requestId, skipText, forceExtract } = opts;
  await logUsageEvent(admin, {
    userId,
    action: 'extract_gate',
    platform,
    status: decision.ok ? (decision.confident ? decision.route : 'low_confidence') : 'error',
    pricedCall: decision.ok
      ? { model: decision.model, costUsd: decision.costUsd, promptTokens: decision.inputTokens }
      : undefined,
    tokensCharged: 0,
    durationMs: decision.ms,
    errorMessage: decision.ok ? null : decision.error.slice(0, 500),
    metadata: {
      request_id: requestId,
      ...(decision.ok
        ? {
            route: decision.route,
            confidence: decision.confidence,
            probabilities: decision.probabilities,
            applied: decision.confident,
          }
        : { applied: false }),
      skipped_text: skipText,
      force_extract: forceExtract,
    },
  });
}

/** Ties the extract row to its gate row, so misroutes show up next to the outcome. */
function extractRouteMetadata(
  gate: Promise<ExtractGateDecision> | null,
  route: ExtractRoute | null,
  requestId: string,
): Record<string, unknown> {
  return gate ? { request_id: requestId, extract_route: route } : {};
}

/** PIN-62: what a video import cost us depends on its length and whether we had to download it. */
function videoMetadata(durationSeconds: number | undefined, videoDownloaded: boolean): Record<string, unknown> {
  return {
    video_duration_seconds:
      typeof durationSeconds === 'number' && Number.isFinite(durationSeconds) ? Math.round(durationSeconds) : null,
    video_downloaded: videoDownloaded,
  };
}

/** A PDF import's size and how it was read, for ai_usage_events (the recipe itself says `photo`). */
function pdfMetadata(pdf: DecodedPdf | null, text: PdfText | null, route: PdfRoute | null): Record<string, unknown> {
  if (!pdf) return {};
  return {
    input: 'pdf',
    pdf_bytes: pdf.bytes.length,
    pdf_pages: text?.pageCount ?? null,
    pdf_scanned_pages: text ? scannedPageCount(text) : null,
    pdf_route: route,
  };
}

/** A PDF turned away before any model call (too big, too many pages, won't open). Nothing was charged. */
function pdfRejectResponse(code: PdfRejectCode): Response {
  return jsonResponse({
    status: 'failed' as ExtractionStatus,
    platform: 'photo',
    code,
    message: pdfRejectMessage(code),
    tokens_charged: 0,
  });
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

/** The link is already in the user's library: return that recipe, charge nothing. */
async function savedRecipeResponse(opts: {
  admin: NonNullable<ReturnType<typeof createServiceSupabase>>;
  existing: Record<string, unknown>;
  platform: Platform;
  userId: string;
  started: number;
}): Promise<Response> {
  const { admin, existing, platform, userId, started } = opts;
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

async function recipeCardHitResponse(opts: {
  admin: NonNullable<ReturnType<typeof createServiceSupabase>>;
  card: Record<string, unknown>;
  platform: Platform;
  userId: string | null;
  started: number;
}): Promise<Response> {
  const { admin, card, platform, userId, started } = opts;
  const cardId = typeof card.id === 'string' ? card.id : null;
  if (cardId) {
    void touchRecipeCardHit(admin, cardId);
  }

  await logUsageEvent(admin, {
    userId,
    action: 'extract',
    platform,
    status: 'cached',
    tokensCharged: 0,
    durationMs: Date.now() - started,
    metadata: { from_hub: true },
  });

  const quota = userId ? await canStartExtract(admin, userId) : null;
  return jsonResponse({
    status: typeof card.extraction_status === 'string' ? card.extraction_status : 'full',
    platform,
    recipe: fitRecipeToLimits(hubCardToExtractRecipe(card)),
    from_hub: true,
    tokens_charged: 0,
    ...quotaFields(quota?.snapshot ?? null),
  });
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
  scope: string;
  platform: Platform;
  started: number;
}): Promise<{
  creditReservation: CreditReservation | null;
  guestReservation: GuestExtractionReservation | null;
  guestRemaining: number | null;
  response?: Response;
}> {
  const { admin, userId, guestInstallId, requestId, scope, platform, started } = opts;
  if (userId) {
    const reserved = await reserveSignedInExtract(admin, userId, requestId, {
      scope,
      replayWindowMs: CREDIT_REPLAY_WINDOW_MS,
    });
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
  onPageRead?: (event: PageReadEvent) => Promise<void>,
): Promise<PlatformMeta> {
  switch (platform) {
    case 'youtube':
      return contentId ? await fetchYouTubeMeta(contentId) : { topComments: [] };
    case 'instagram':
      return await fetchInstagramMeta(url);
    case 'tiktok':
      return await fetchTikTokMeta(url);
    case 'facebook':
      return await fetchFacebookMeta(url);
    case 'web':
      return await fetchWebRecipeMeta(url, { onPageRead });
    default:
      return { topComments: [] };
  }
}

function canonicalOriginalUrl(
  platform: Platform,
  contentId: string | null | undefined,
  url: string,
  resolvedUrl?: string | null,
): string {
  if (platform === 'youtube' && contentId) return canonicalYouTubeWatchUrl(contentId);
  if (platform === 'instagram' && contentId) return canonicalInstagramUrl(contentId);
  if (platform === 'tiktok' && contentId) return canonicalTikTokUrl(contentId);
  if (platform === 'facebook') return resolvedUrl?.trim() || canonicalFacebookUrl(url);
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

  if (
    (platform === 'instagram' || platform === 'tiktok' || platform === 'facebook' || platform === 'web') &&
    meta.thumbnailUrl
  ) {
    // A web page's image is copied too, so its site can't swap the picture later (PIN-153).
    const hosted = await persistSocialThumbnail({
      sourceUrl: meta.thumbnailUrl,
      platform,
      contentId,
    });
    // Prefer our own copy. The user's recipe falls back to the source's link so it still has a
    // chance of a picture; the public Hub card only ever takes our copy (publishRecipeCard).
    return hosted ?? meta.thumbnailUrl;
  }

  return meta.thumbnailUrl ?? null;
}
