/**
 * One-time backfill of `recipe_cards.diets` on cards published before PIN-83.
 *
 * The database and the diets task are passed in, so the batch logic is tested without a network
 * or a database (dietsBackfill_test.ts). backfill-diets/index.ts wires in Supabase.
 */

import type { GeminiUsageSnapshot } from './pricing.ts';
import type { DeriveDietsResult, DietsRecipeInput, HubDietKey } from './recipeDiets.ts';

export const MAX_DIETS_BACKFILL_BATCH = 20;

export type PendingCard = { id: string } & DietsRecipeInput;

export interface DietsBackfillDb {
  /** Cards with diets IS NULL and id > after, ordered by id, at most `limit`. */
  fetchPending(after: string | null, limit: number): Promise<PendingCard[]>;
  /** Cards still NULL, for a dry run. */
  countPending(): Promise<number>;
  /** Writes only if the card is still NULL; returns false when someone else got there first. */
  saveDiets(id: string, diets: HubDietKey[]): Promise<boolean>;
}

export type DeriveDietsFn = (recipe: DietsRecipeInput) => Promise<DeriveDietsResult>;

export type DietsBackfillResult = {
  scanned: number;
  /** Cards that now have a list (including []). */
  updated: number;
  /** Cards the task could not check. They stay NULL and are not retried in this pass. */
  stillNull: number;
  /** Cards another writer filled between our read and our write. */
  skipped: number;
  /** Pass this as `after` for the next batch; null when done. */
  nextCursor: string | null;
  usages: GeminiUsageSnapshot[];
  errors: string[];
};

export function clampDietsBatchSize(value: unknown): number {
  const n = typeof value === 'number' && Number.isInteger(value) ? value : MAX_DIETS_BACKFILL_BATCH;
  return Math.min(Math.max(n, 1), MAX_DIETS_BACKFILL_BATCH);
}

/** Runs one batch. Never throws for a single bad card; a failed card is reported and stays NULL. */
export async function runDietsBackfillBatch(
  db: DietsBackfillDb,
  derive: DeriveDietsFn,
  options: { after: string | null; limit: number },
): Promise<DietsBackfillResult> {
  const rows = await db.fetchPending(options.after, options.limit);
  const result: DietsBackfillResult = {
    scanned: rows.length,
    updated: 0,
    stillNull: 0,
    skipped: 0,
    nextCursor: rows.length === options.limit ? rows[rows.length - 1].id : null,
    usages: [],
    errors: [],
  };

  for (const row of rows) {
    const derived = await derive(row);
    result.usages.push(...derived.usages);
    if (derived.error) result.errors.push(`${row.id}: ${derived.error}`);
    if (derived.diets === null) {
      result.stillNull += 1;
      continue;
    }
    try {
      if (await db.saveDiets(row.id, derived.diets)) result.updated += 1;
      else result.skipped += 1;
    } catch (error) {
      result.stillNull += 1;
      result.errors.push(`${row.id}: save failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return result;
}
