import { normalizeStoredCalories } from '../_shared/calories.ts';
import {
  classifyGeminiRecipe,
  recipeRepairIsUpgrade,
} from '../_shared/classifyRecipe.ts';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { repairPartialRecipe, type GeminiRecipe } from '../_shared/gemini.ts';
import { fetchInstagramMeta } from '../_shared/instagram.ts';
import {
  detectPlatform,
  extractVideoIdForPlatform,
  type Platform,
} from '../_shared/platform.ts';
import type { PlatformMeta } from '../_shared/platformMeta.ts';
import {
  canStartExtract,
  finalizeSignedInExtract,
  quotaFields,
  type CreditReservation,
  type GuestExtractionReservation,
  markGuestExtractionCompensationPending,
  markSignedInExtractCompensationPending,
  refundGuestExtraction,
  refundSignedInExtract,
  refundSignedInExtractAfterFinalizeFailure,
  reserveSignedInExtract,
} from '../_shared/quotas.ts';
import { createAuthedSupabase } from '../_shared/recipeLookup.ts';
import { createServiceSupabase } from '../_shared/supabaseAdmin.ts';
import { normalizeRecipeTags } from '../_shared/tags.ts';
import { fetchTikTokMeta } from '../_shared/tiktok.ts';
import { logUsageEvent } from '../_shared/usageLog.ts';
import { fetchWebRecipeMeta } from '../_shared/webRecipe.ts';
import { fetchYouTubeMeta } from '../_shared/youtube.ts';

const MAX_BODY_BYTES = 96_000;
const MAX_TITLE_CHARS = 200;
const MAX_INGREDIENTS = 60;
const MAX_INSTRUCTIONS = 50;

interface RepairIngredient {
  name?: string;
  quantity?: number;
  unit?: string;
  metric?: { quantity?: number; unit?: string };
  spoons?: { quantity?: number; unit?: string };
}

interface RequestBody {
  action?: string;
  reservation_id?: string;
  original_url?: string;
  guest_install_id?: string;
  guestInstallId?: string;
  request_id?: string;
  requestId?: string;
  recipe?: {
    title?: string;
    servings?: number;
    ingredients?: RepairIngredient[];
    instructions?: { step?: number; text?: string; timestamp_seconds?: number }[];
    calories?: number;
    estimated_time_minutes?: number;
    cost_estimate?: string;
    effort_level?: string;
    tags?: string[];
    source_language?: string;
  };
}

/**
 * POST { recipe, original_url?, request_id? }
 *   -> reserved upgrade preview { recipe, reservation_id } (credit not finalized)
 * POST { action: 'commit' | 'abort', reservation_id, request_id? }
 *   -> finalize or refund the reserved credit
 *
 * Signed-in only. Charges 1 credit when the user applies an upgrade.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }
  if (requestIsTooLarge(req, MAX_BODY_BYTES)) {
    return jsonResponse({ error: 'Request payload is too large' }, 400);
  }

  const started = Date.now();
  let body: RequestBody;
  try {
    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      return jsonResponse({ error: 'Request payload is too large' }, 400);
    }
    body = JSON.parse(rawBody) as RequestBody;
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const admin = createServiceSupabase();
  const authHeader = req.headers.get('Authorization');
  const authed = authHeader ? createAuthedSupabase(authHeader) : null;
  const {
    data: { user },
  } = authed ? await authed.auth.getUser() : { data: { user: null } };
  const userId = user?.id ?? null;

  if (!userId) {
    return jsonResponse(
      {
        status: 'failed',
        code: 'auth_required',
        message: 'Sign in to repair recipes.',
      },
      401,
    );
  }
  if (!admin) {
    return jsonResponse(
      { status: 'failed', code: 'metering_error', message: 'metering_error' },
      500,
    );
  }

  let requestId = crypto.randomUUID();
  const rawRequestId = body.request_id ?? body.requestId;
  if (typeof rawRequestId === 'string' && rawRequestId.trim().length >= 8) {
    requestId = rawRequestId.trim().slice(0, 128);
  }

  const action =
    body.action === 'commit' || body.action === 'abort' ? body.action : 'generate';
  const reservationIdRaw =
    typeof body.reservation_id === 'string' ? body.reservation_id.trim() : '';
  const settleReservationId = reservationIdRaw.length >= 8 ? reservationIdRaw.slice(0, 128) : null;

  if (action === 'commit' || action === 'abort') {
    if (!settleReservationId) {
      return jsonResponse(
        { status: 'failed', code: 'reservation_required', message: 'Missing reservation.' },
        400,
      );
    }
    return await settleRepairCredit({
      admin,
      userId,
      action,
      reservationId: settleReservationId,
      requestId,
      started,
    });
  }

  const current = toGeminiRecipe(body.recipe);
  if (!current) {
    return jsonResponse({ error: 'Missing or invalid "recipe" in request body' }, 400);
  }

  const beforeClass = classifyGeminiRecipe(current);
  if (beforeClass.status !== 'partial') {
    return jsonResponse(
      {
        status: 'failed',
        code: 'not_partial',
        message: 'This recipe is already complete.',
      },
      400,
    );
  }

  const originalUrl =
    typeof body.original_url === 'string' ? body.original_url.trim().slice(0, 2_000) : '';

  let creditReservation: CreditReservation | null = null;
  const guestReservation: GuestExtractionReservation | null = null;
  const guestInstallId: string | null = null;

  const reserved = await reserveSignedInExtract(admin, userId, requestId);
  if (!reserved.ok) {
    return jsonResponse(
      {
        status: 'failed',
        code: reserved.code,
        message: reserved.code === 'insufficient_credits' ? 'insufficient_credits' : 'metering_error',
        ...quotaFields(reserved.snapshot),
      },
      reserved.code === 'metering_error' ? 500 : 402,
    );
  }
  creditReservation = reserved.reservation;

  const platform: Platform = originalUrl ? detectPlatform(originalUrl) : 'unknown';

  try {
    let extraText = '';
    if (originalUrl && platform !== 'unknown' && platform !== 'photo') {
      try {
        const contentId = extractVideoIdForPlatform(originalUrl, platform);
        const meta = await fetchPlatformMeta(platform, originalUrl, contentId);
        extraText = buildExtraText(meta);
      } catch (err) {
        console.error('[repair-recipe] meta fetch failed', err);
      }
    }

    const repaired = await repairPartialRecipe({ current, extraText });
    const after = { ...repaired.recipe, found_recipe: true };
    const upgraded = recipeRepairIsUpgrade(current, after);
    const classified = classifyGeminiRecipe(after);

    if (!upgraded || classified.status === 'failed') {
      await refundReservation(
        admin,
        userId,
        guestInstallId,
        creditReservation,
        guestReservation,
        'no_improvement',
      );
      creditReservation = null;
      const snapshot = (await canStartExtract(admin, userId)).snapshot;
      await logUsageEvent(admin, {
        userId,
        action: 'repair',
        platform,
        status: 'no_improvement',
        usages: repaired.usage ? [repaired.usage] : [],
        tokensCharged: 0,
        durationMs: Date.now() - started,
        metadata: { request_id: requestId },
      });
      return jsonResponse({
        status: 'failed',
        code: 'no_improvement',
        message: "Couldn't find more details this time. Your credit was not used.",
        ...quotaFields(snapshot),
      });
    }

    const recipe = {
      title: after.title,
      source_language: normalizeLanguageCode(after.source_language),
      ingredients: after.ingredients,
      instructions: after.instructions,
      servings: after.servings > 0 ? after.servings : current.servings || 1,
      calories: normalizeStoredCalories(
        after.calories ?? null,
        after.servings > 0 ? after.servings : current.servings || 1,
      ),
      estimated_time_minutes: after.estimated_time_minutes ?? current.estimated_time_minutes ?? null,
      cost_estimate: after.cost_estimate ?? current.cost_estimate ?? null,
      effort_level: after.effort_level ?? current.effort_level ?? null,
      extraction_status: classified.status,
      calories_reasoning: after.calories_reasoning?.trim() || null,
      time_reasoning: after.time_reasoning?.trim() || null,
      tags: normalizeRecipeTags(after.tags?.length ? after.tags : current.tags),
      missing_fields: classified.missingFields,
    };

    const snapshot = (await canStartExtract(admin, userId)).snapshot;
    await logUsageEvent(admin, {
      userId,
      action: 'repair',
      platform,
      status: 'preview',
      usages: repaired.usage ? [repaired.usage] : [],
      tokensCharged: 0,
      durationMs: Date.now() - started,
      metadata: {
        request_id: requestId,
        reservation_id: creditReservation.reservationId,
        upgraded: true,
      },
    });

    return jsonResponse({
      status: classified.status,
      recipe,
      summary: repaired.filledSummary,
      filled_fields: beforeClass.missingFields.filter(
        (field) => !classified.missingFields.includes(field),
      ),
      reservation_id: creditReservation.reservationId,
      pending_credit: true,
      tokens_charged: 0,
      ...quotaFields(snapshot),
    });
  } catch (err) {
    console.error('[repair-recipe] error', err);
    await refundReservation(
      admin,
      userId,
      guestInstallId,
      creditReservation,
      guestReservation,
      'repair_failed',
    );
    await logUsageEvent(admin, {
      userId,
      guestInstallId: userId ? null : guestInstallId,
      action: 'repair',
      platform,
      status: 'error',
      tokensCharged: 0,
      durationMs: Date.now() - started,
      errorMessage: err instanceof Error ? err.message.slice(0, 500) : String(err),
    });
    return jsonResponse(
      {
        status: 'failed',
        message: "Couldn't repair this recipe. Your credit was not used.",
      },
      500,
    );
  }
});

async function settleRepairCredit(opts: {
  admin: NonNullable<ReturnType<typeof createServiceSupabase>>;
  userId: string;
  action: 'commit' | 'abort';
  reservationId: string;
  requestId: string;
  started: number;
}): Promise<Response> {
  const { admin, userId, action, reservationId, requestId, started } = opts;
  const snapshot = (await canStartExtract(admin, userId)).snapshot;

  if (action === 'abort') {
    const refunded = await refundSignedInExtract(
      admin,
      userId,
      reservationId,
      'user_cancelled',
    );
    if (!refunded.confirmed) {
      await markSignedInExtractCompensationPending(
        admin,
        userId,
        reservationId,
        'user_cancelled',
        refunded.error,
      );
      await logUsageEvent(admin, {
        userId,
        action: 'repair',
        platform: 'unknown',
        status: 'compensation_pending',
        tokensCharged: 0,
        durationMs: Date.now() - started,
        metadata: { request_id: requestId, reservation_id: reservationId, settle: 'abort' },
      });
      return jsonResponse(
        {
          status: 'failed',
          code: 'compensation_pending',
          message: 'metering_error',
        },
        500,
      );
    }
    await logUsageEvent(admin, {
      userId,
      action: 'repair',
      platform: 'unknown',
      status: 'aborted',
      tokensCharged: 0,
      durationMs: Date.now() - started,
      metadata: { request_id: requestId, reservation_id: reservationId },
    });
    const after = (await canStartExtract(admin, userId)).snapshot;
    return jsonResponse({
      status: 'ok',
      action: 'abort',
      tokens_charged: 0,
      ...quotaFields(after ?? snapshot),
    });
  }

  const finalized = await finalizeSignedInExtract(admin, userId, reservationId);
  if (!finalized) {
    const compensated = await refundSignedInExtractAfterFinalizeFailure(
      admin,
      userId,
      reservationId,
    );
    const refunded = compensated.confirmed
      ? compensated
      : await refundSignedInExtract(admin, userId, reservationId, 'commit_failed');
    if (!compensated.confirmed && !refunded.confirmed) {
      await markSignedInExtractCompensationPending(
        admin,
        userId,
        reservationId,
        'commit_failed',
        refunded.error,
      );
    }
    await logUsageEvent(admin, {
      userId,
      action: 'repair',
      platform: 'unknown',
      status: compensated.confirmed || refunded.confirmed ? 'metering_error' : 'compensation_pending',
      tokensCharged: 0,
      durationMs: Date.now() - started,
      metadata: { request_id: requestId, reservation_id: reservationId, settle: 'commit' },
    });
    return jsonResponse(
      {
        status: 'failed',
        code: compensated.confirmed || refunded.confirmed ? 'metering_error' : 'compensation_pending',
        message: 'metering_error',
      },
      500,
    );
  }

  await logUsageEvent(admin, {
    userId,
    action: 'repair',
    platform: 'unknown',
    status: 'committed',
    tokensCharged: 1,
    durationMs: Date.now() - started,
    metadata: { request_id: requestId, reservation_id: reservationId },
  });
  const after = (await canStartExtract(admin, userId)).snapshot;
  return jsonResponse({
    status: 'ok',
    action: 'commit',
    tokens_charged: 1,
    ...quotaFields(after ?? snapshot),
  });
}

function requestIsTooLarge(req: Request, maxBytes: number): boolean {
  const contentLength = Number(req.headers.get('content-length'));
  return Number.isFinite(contentLength) && contentLength > maxBytes;
}

function toGeminiRecipe(raw: RequestBody['recipe']): GeminiRecipe | null {
  if (!raw?.title?.trim()) return null;
  if (raw.title.trim().length > MAX_TITLE_CHARS) return null;
  if (!Array.isArray(raw.ingredients) || raw.ingredients.length > MAX_INGREDIENTS) return null;
  if (!Array.isArray(raw.instructions) || raw.instructions.length > MAX_INSTRUCTIONS) return null;

  const ingredients = raw.ingredients
    .filter((item) => typeof item?.name === 'string' && item.name.trim())
    .map((item) => ({
      name: item.name!.trim(),
      quantity: typeof item.quantity === 'number' && Number.isFinite(item.quantity) ? item.quantity : 0,
      unit: typeof item.unit === 'string' ? item.unit.trim() : '',
      metric: item.metric,
      spoons: item.spoons,
    }));
  const instructions = raw.instructions
    .filter((step) => typeof step?.text === 'string' && step.text.trim())
    .map((step, index) => ({
      step: typeof step.step === 'number' && Number.isInteger(step.step) ? step.step : index + 1,
      text: step.text!.trim(),
      timestamp_seconds: step.timestamp_seconds,
    }));

  const servings =
    typeof raw.servings === 'number' && Number.isInteger(raw.servings) && raw.servings > 0
      ? raw.servings
      : 1;

  return {
    found_recipe: true,
    source_language: typeof raw.source_language === 'string' ? raw.source_language : 'en',
    title: raw.title.trim(),
    servings,
    ingredients,
    instructions,
    calories: typeof raw.calories === 'number' ? raw.calories : undefined,
    estimated_time_minutes:
      typeof raw.estimated_time_minutes === 'number' ? raw.estimated_time_minutes : undefined,
    cost_estimate:
      raw.cost_estimate === '$' || raw.cost_estimate === '$$' || raw.cost_estimate === '$$$'
        ? raw.cost_estimate
        : undefined,
    effort_level:
      raw.effort_level === 'Easy' || raw.effort_level === 'Medium' || raw.effort_level === 'Hard'
        ? raw.effort_level
        : undefined,
    tags: Array.isArray(raw.tags) ? raw.tags.filter((tag): tag is string => typeof tag === 'string') : [],
  };
}

function buildExtraText(meta: PlatformMeta): string {
  const parts: string[] = [];
  if (meta.description?.trim()) parts.push(meta.description.trim());
  if (meta.captions?.trim()) parts.push(meta.captions.trim());
  for (const comment of meta.topComments.slice(0, 12)) {
    parts.push(
      comment.isCreator ? `(from the video's creator) ${comment.text}` : comment.text,
    );
  }
  return parts.join('\n\n');
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

function normalizeLanguageCode(value: string | null | undefined): string {
  const normalized = value?.trim().toLowerCase().split(/[-_]/)[0];
  return normalized && /^[a-z]{2}$/.test(normalized) ? normalized : 'en';
}

async function refundReservation(
  admin: ReturnType<typeof createServiceSupabase>,
  userId: string | null,
  guestInstallId: string | null,
  signedIn: CreditReservation | null,
  guest: GuestExtractionReservation | null,
  reason: string,
): Promise<void> {
  if (!admin) return;
  if (userId && signedIn) {
    await compensateSignedIn(admin, userId, signedIn, reason, false);
  } else if (guestInstallId && guest) {
    await compensateGuest(admin, guestInstallId, guest, reason);
  }
}

async function compensateSignedIn(
  admin: NonNullable<ReturnType<typeof createServiceSupabase>>,
  userId: string,
  reservation: CreditReservation,
  reason: string,
  afterFinalizeFailure: boolean,
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
  const result = await refundGuestExtraction(
    admin,
    installId,
    reservation.reservationId,
    reason,
  );
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
