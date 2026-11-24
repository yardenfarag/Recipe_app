import { handler, HttpError } from '../_shared/core/handler.ts';
import {
  canStartExtract,
  type CreditReservation,
  type GuestExtractionReservation,
  quotaFields,
  reserveSignedInExtract,
} from '../_shared/core/quotas.ts';
import { extractVideoIdForPlatform } from '../_shared/core/recipeLookup.ts';
import { sealJson } from '../_shared/core/sealedPayload.ts';
import { createAuthedSupabase } from '../_shared/core/supabaseAdmin.ts';
import { classifyLlmRecipe, keepDraftLists, recipeRepairIsUpgrade } from '../_shared/extraction/classifyRecipe.ts';
import { pageReadLogger } from '../_shared/extraction/pageReader.ts';
import { detectPlatform, type Platform } from '../_shared/extraction/platform.ts';
import { repairPartialRecipe } from '../_shared/extraction/recipeExtraction.ts';
import {
  buildExtraText,
  fetchPlatformMeta,
  MAX_REPAIR_BODY_BYTES,
  repairedRecipe,
  type RepairRequestBody,
  toLlmRecipe,
} from '../_shared/extraction/recipeRepair.ts';
import {
  refundRepairReservation,
  repairSealContext,
  sealingSecret,
  settleRepairCredit,
} from '../_shared/extraction/recipeRepairCredit.ts';
import { appliancesForRecipe } from '../_shared/recipes/enrich/recipeAppliances.ts';

const signIn = new HttpError(401, 'auth_required', 'Sign in to repair recipes.');
const meteringError = new HttpError(500, 'metering_error', 'metering_error');

/**
 * POST { recipe, original_url?, request_id? }
 *   -> reserved upgrade preview { recipe, reservation_id } (credit not finalized)
 * POST { action: 'commit' | 'abort', reservation_id, request_id? }
 *   -> finalize or refund the reserved credit
 *
 * Signed-in only. Charges 1 credit when the user applies an upgrade.
 *
 * Failure codes (the app's words for them are in shared/lib/serverErrors.ts): auth_required, metering_error,
 * reservation_required, not_partial, insufficient_credits, no_improvement, repair_failed, reservation_settled,
 * compensation_pending, sealed_recipe_required. Bad requests answer { error }.
 *
 * The body is read and checked before sign-in, as it always was, so the wrapper does no auth.
 */
handler(
  {
    name: 'repair-recipe',
    auth: 'none',
    maxBodyBytes: MAX_REPAIR_BODY_BYTES,
    legacyErrorShape: true,
    errors: { misconfigured: meteringError },
    input: (raw) => raw as RepairRequestBody,
  },
  async ({ req, input: body, admin, startedAt, log }) => {
    const authHeader = req.headers.get('Authorization');
    const authed = authHeader ? createAuthedSupabase(authHeader) : null;
    const {
      data: { user },
    } = authed ? await authed.auth.getUser() : { data: { user: null } };
    const userId = user?.id ?? null;
    if (!userId) throw signIn;

    let requestId: string = crypto.randomUUID();
    const rawRequestId = body.request_id ?? body.requestId;
    if (typeof rawRequestId === 'string' && rawRequestId.trim().length >= 8) {
      requestId = rawRequestId.trim().slice(0, 128);
    }

    const action = body.action === 'commit' || body.action === 'abort' ? body.action : 'generate';
    const reservationIdRaw = typeof body.reservation_id === 'string' ? body.reservation_id.trim() : '';
    const settleReservationId = reservationIdRaw.length >= 8 ? reservationIdRaw.slice(0, 128) : null;

    if (action === 'commit' || action === 'abort') {
      if (!settleReservationId) throw new HttpError(400, 'reservation_required', 'Missing reservation.');
      return await settleRepairCredit({
        admin,
        userId,
        action,
        reservationId: settleReservationId,
        sealedRecipe: typeof body.sealed_recipe === 'string' ? body.sealed_recipe : null,
        requestId,
        started: startedAt,
      });
    }

    const current = toLlmRecipe(body.recipe);
    if (!current) throw HttpError.legacy(400, 'Missing or invalid "recipe" in request body');

    const beforeClass = classifyLlmRecipe(current);
    if (beforeClass.status !== 'partial') {
      throw new HttpError(400, 'not_partial', 'This recipe is already complete.');
    }

    const originalUrl = typeof body.original_url === 'string' ? body.original_url.trim().slice(0, 2_000) : '';

    let creditReservation: CreditReservation | null = null;
    const guestReservation: GuestExtractionReservation | null = null;
    const guestInstallId: string | null = null;

    // The credit pays for repairing this recipe only. A spent credit is never replayed here:
    // the repaired recipe is released by commit, so a new generate is a new purchase.
    const reserved = await reserveSignedInExtract(admin, userId, requestId, {
      scope: `repair|${originalUrl}|${JSON.stringify(body.recipe)}`,
      replayWindowMs: 0,
    });
    if (!reserved.ok) {
      throw new HttpError(
        reserved.code === 'metering_error' ? 500 : 402,
        reserved.code,
        reserved.code === 'insufficient_credits' ? 'insufficient_credits' : 'metering_error',
        quotaFields(reserved.snapshot),
      );
    }
    creditReservation = reserved.reservation;

    const platform: Platform = originalUrl ? detectPlatform(originalUrl) : 'unknown';

    try {
      let extraText = '';
      if (originalUrl && platform !== 'unknown' && platform !== 'photo') {
        try {
          const contentId = extractVideoIdForPlatform(originalUrl, platform);
          const meta = await fetchPlatformMeta(
            platform,
            originalUrl,
            contentId,
            pageReadLogger(admin, { userId, guestInstallId, forAction: 'repair' }),
          );
          extraText = buildExtraText(meta);
        } catch (err) {
          console.error('[repair-recipe] meta fetch failed', err);
        }
      }

      const repaired = await repairPartialRecipe({ current, extraText });
      const after = { ...keepDraftLists(current, repaired.recipe), found_recipe: true };
      const upgraded = recipeRepairIsUpgrade(current, after);
      const classified = classifyLlmRecipe(after);

      if (!upgraded || classified.status === 'failed') {
        await refundRepairReservation(
          admin,
          userId,
          guestInstallId,
          creditReservation,
          guestReservation,
          'no_improvement',
        );
        creditReservation = null;
        const snapshot = (await canStartExtract(admin, userId)).snapshot;
        await log.usage({
          userId,
          action: 'repair',
          platform,
          status: 'no_improvement',
          usages: repaired.usage ? [repaired.usage] : [],
          tokensCharged: 0,
          metadata: { request_id: requestId },
        });
        // A 200 with a failed body, as the app has always received it.
        return {
          status: 'failed',
          code: 'no_improvement',
          message: "Couldn't find more details this time. Your credit was not used.",
          ...quotaFields(snapshot),
        };
      }

      // Repair can add or rewrite steps, so appliances are derived from the repaired recipe (ADR 017).
      const usages = repaired.usage ? [repaired.usage] : [];
      const { appliances, metadata: applianceMetadata } = await appliancesForRecipe(after, usages);

      const recipe = repairedRecipe(current, after, classified, appliances);

      const snapshot = (await canStartExtract(admin, userId)).snapshot;
      await log.usage({
        userId,
        action: 'repair',
        platform,
        status: 'preview',
        usages,
        tokensCharged: 0,
        metadata: {
          request_id: requestId,
          reservation_id: creditReservation.reservationId,
          upgraded: true,
          ...applianceMetadata,
        },
      });

      // The recipe stays sealed until commit finalizes the credit, so aborting
      // can't keep the repair for free.
      return {
        status: classified.status,
        sealed_recipe: await sealJson(
          recipe,
          repairSealContext(userId, creditReservation.reservationId),
          sealingSecret(),
        ),
        summary: repaired.filledSummary,
        filled_fields: beforeClass.missingFields.filter((field) => !classified.missingFields.includes(field)),
        reservation_id: creditReservation.reservationId,
        pending_credit: true,
        tokens_charged: 0,
        ...quotaFields(snapshot),
      };
    } catch (err) {
      console.error('[repair-recipe] error', err);
      await refundRepairReservation(
        admin,
        userId,
        guestInstallId,
        creditReservation,
        guestReservation,
        'repair_failed',
      );
      await log.usage({
        userId,
        guestInstallId: userId ? null : guestInstallId,
        action: 'repair',
        platform,
        status: 'error',
        tokensCharged: 0,
        errorMessage: err instanceof Error ? err.message.slice(0, 500) : String(err),
      });
      throw new HttpError(500, 'repair_failed', "Couldn't repair this recipe. Your credit was not used.");
    }
  },
);
