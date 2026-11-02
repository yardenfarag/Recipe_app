/**
 * One-time backfill of `appliances` on rows saved before PIN-26 (ADR 017 decision 8).
 *
 * The database and the appliances task are passed in, so the batch logic is tested without a network
 * or a database (appliancesBackfill_test.ts). backfill-appliances/index.ts wires in Supabase.
 */

import type { RecipeAppliance } from './appliances.ts';
import type { GeminiUsageSnapshot } from './pricing.ts';
import type { AppliancesRecipeInput, DeriveAppliancesResult } from './recipeAppliances.ts';

export type BackfillTable = 'recipes' | 'recipe_cards';

export const BACKFILL_TABLES: readonly BackfillTable[] = ['recipes', 'recipe_cards'];
export const MAX_BACKFILL_BATCH = 20;

export type PendingRow = { id: string } & AppliancesRecipeInput;

export interface BackfillDb {
  /** Rows with appliances IS NULL and id > after, ordered by id, at most `limit`. */
  fetchPending(table: BackfillTable, after: string | null, limit: number): Promise<PendingRow[]>;
  /** Rows still NULL, for a dry run. */
  countPending(table: BackfillTable): Promise<number>;
  /** Writes only if the row is still NULL; returns false when someone else got there first. */
  saveAppliances(table: BackfillTable, id: string, appliances: RecipeAppliance[]): Promise<boolean>;
}

export type DeriveFn = (recipe: AppliancesRecipeInput) => Promise<DeriveAppliancesResult>;

export type BackfillBatchResult = {
  table: BackfillTable;
  scanned: number;
  /** Rows that now have a list (including []). */
  updated: number;
  /** Rows the task could not analyse (no steps, model error). They stay NULL and are not retried in this pass. */
  stillNull: number;
  /** Rows another writer filled between our read and our write. */
  skipped: number;
  /** Pass this as `after` for the next batch; null when the table is done. */
  nextCursor: string | null;
  usages: GeminiUsageSnapshot[];
  errors: string[];
};

export function clampBatchSize(value: unknown): number {
  const n = typeof value === 'number' && Number.isInteger(value) ? value : MAX_BACKFILL_BATCH;
  return Math.min(Math.max(n, 1), MAX_BACKFILL_BATCH);
}

export function isBackfillTable(value: unknown): value is BackfillTable {
  return value === 'recipes' || value === 'recipe_cards';
}

/** Runs one batch. Never throws for a single bad row; a failed row is reported and stays NULL. */
export async function runAppliancesBackfillBatch(
  db: BackfillDb,
  derive: DeriveFn,
  options: { table: BackfillTable; after: string | null; limit: number },
): Promise<BackfillBatchResult> {
  const rows = await db.fetchPending(options.table, options.after, options.limit);
  const result: BackfillBatchResult = {
    table: options.table,
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
    if (derived.appliances === null) {
      result.stillNull += 1;
      continue;
    }
    try {
      if (await db.saveAppliances(options.table, row.id, derived.appliances)) result.updated += 1;
      else result.skipped += 1;
    } catch (error) {
      result.stillNull += 1;
      result.errors.push(`${row.id}: save failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return result;
}
