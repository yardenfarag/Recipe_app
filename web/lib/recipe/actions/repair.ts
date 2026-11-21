import {
  repairRecipe,
  repairRequestKey,
  settleRepairRecipe,
  type RepairedRecipePayload,
} from "@shared/lib/supabase/repairRecipe";
import type { Recipe } from "@shared/types/recipe";

import { repairRequest } from "@/lib/recipe/actions/contentEdits";
import { acknowledgeRequest, webExtractionContext } from "@/lib/snap/requestIds";

/** Repair costs one credit, charged only when the result is applied (ADR 019). */
export const REPAIR_CREDITS = 1;

/** What Repair found, waiting for the reader to apply it (that commits the credit) or not (nothing is charged). */
export type RepairOffer = { summary: string | null; reservationId: string; requestId?: string; sealed: string; key: string };

export type RepairAttempt =
  | { status: "offer"; offer: RepairOffer }
  | { status: "no_credits"; needed?: number }
  | { status: "failed"; reason: "no_improvement" | "other" };

/**
 * Repair a partial import (ADR 019), step one: `repair-recipe` looks for the missing details and holds a credit.
 * The request id is kept in this browser until the outcome is known, so a retry after a lost answer is not charged
 * twice (the same rule as Snap).
 */
export async function findRepair(recipe: Recipe): Promise<RepairAttempt> {
  const request = repairRequest(recipe);
  const key = repairRequestKey(request);
  const result = await repairRecipe(webExtractionContext, request);
  if (result.code === "insufficient_credits") return { status: "no_credits", needed: REPAIR_CREDITS };
  if (result.status === "failed" || !result.sealed_recipe || !result.reservation_id) {
    // The request id is kept, as on mobile: a retry reuses it, so it is never charged twice.
    return { status: "failed", reason: result.code === "no_improvement" ? "no_improvement" : "other" };
  }
  return {
    status: "offer",
    offer: {
      summary: result.summary?.trim() || null,
      reservationId: result.reservation_id,
      requestId: result.request_id,
      sealed: result.sealed_recipe,
      key,
    },
  };
}

/** Step two, Apply: commits the credit and returns the repaired recipe. Null when that failed (nothing charged). */
export async function applyRepair(offer: RepairOffer): Promise<RepairedRecipePayload | null> {
  const settled = await settleRepairRecipe("commit", offer.reservationId, offer.requestId, offer.sealed);
  if (settled.status === "failed" || !settled.recipe) {
    await settleRepairRecipe("abort", offer.reservationId, offer.requestId).catch(() => undefined);
    return null;
  }
  if (offer.requestId) await acknowledgeRequest(offer.key, offer.requestId);
  return settled.recipe;
}

/** Step two, Cancel: lets the held credit go. */
export async function declineRepair(offer: RepairOffer): Promise<void> {
  await settleRepairRecipe("abort", offer.reservationId, offer.requestId).catch(() => undefined);
  if (offer.requestId) await acknowledgeRequest(offer.key, offer.requestId);
}
