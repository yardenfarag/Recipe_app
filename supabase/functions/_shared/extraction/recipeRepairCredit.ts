/**
 * repair-recipe's credit: the preview reserves one credit, then the app commits it (finalize, and the sealed recipe
 * is released) or aborts it (refund). Moved here unchanged from repair-recipe/index.ts (PIN-34).
 */
import { jsonResponse } from '../core/cors.ts';
import {
  canStartExtract,
  type CreditReservation,
  finalizeSignedInExtract,
  type GuestExtractionReservation,
  markGuestExtractionCompensationPending,
  markSignedInExtractCompensationPending,
  quotaFields,
  refundGuestExtraction,
  refundSignedInExtract,
  refundSignedInExtractAfterFinalizeFailure,
} from '../core/quotas.ts';
import { openJson } from '../core/sealedPayload.ts';
import type { Db } from '../core/supabaseAdmin.ts';
import { logUsageEvent } from '../core/usageLog.ts';

export async function settleRepairCredit(opts: {
  admin: Db;
  userId: string;
  action: 'commit' | 'abort';
  reservationId: string;
  sealedRecipe: string | null;
  requestId: string;
  started: number;
}): Promise<Response> {
  const { admin, userId, action, reservationId, sealedRecipe, requestId, started } = opts;
  const snapshot = (await canStartExtract(admin, userId)).snapshot;

  if (action === 'abort') {
    const refunded = await refundSignedInExtract(
      admin,
      userId,
      reservationId,
      'user_cancelled',
    );
    if (!refunded.confirmed) {
      // Only an unspent credit can be queued. A committed (spent) one is refused, so abort
      // can't give back a credit that already paid for a recipe.
      const queued = await markSignedInExtractCompensationPending(
        admin,
        userId,
        reservationId,
        'user_cancelled',
        refunded.error,
      );
      if (!queued) {
        await logUsageEvent(admin, {
          userId,
          action: 'repair',
          platform: 'unknown',
          status: 'abort_refused',
          tokensCharged: 0,
          durationMs: Date.now() - started,
          metadata: { request_id: requestId, reservation_id: reservationId, settle: 'abort' },
        });
        return jsonResponse(
          {
            status: 'failed',
            code: 'reservation_settled',
            message: 'This credit was already used.',
            ...quotaFields(snapshot),
          },
          409,
        );
      }
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

  const recipe = sealedRecipe
    ? await openJson<Record<string, unknown>>(
        sealedRecipe,
        repairSealContext(userId, reservationId),
        sealingSecret(),
      )
    : null;
  if (!recipe) {
    return jsonResponse(
      { status: 'failed', code: 'sealed_recipe_required', message: 'Missing repaired recipe.' },
      400,
    );
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
        { afterFinalizeFailure: true },
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
    recipe,
    tokens_charged: 1,
    ...quotaFields(after ?? snapshot),
  });
}

export function repairSealContext(userId: string, reservationId: string): string {
  return `repair:${userId}:${reservationId}`;
}

/** The service client exists by the time this is called, so the key is set. */
export function sealingSecret(): string {
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
}

export async function refundRepairReservation(
  admin: Db | null,
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
  admin: Db,
  userId: string,
  reservation: CreditReservation,
  reason: string,
  afterFinalizeFailure: boolean,
): Promise<boolean> {
  if (reservation.replayed) return true;
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
    { afterFinalizeFailure },
  );
  return false;
}

async function compensateGuest(
  admin: Db,
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
