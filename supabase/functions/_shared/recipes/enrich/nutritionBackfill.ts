/**
 * One-time backfill of protein, carbs and fat on Hub cards and library recipes saved before PIN-80.
 *
 * Each row's stored calories are given to the model, which only splits them, so the calories
 * people already see never change. Cards first: Hub saves and Hub hits copy a card's nutrition.
 *
 * The database and the task are passed in, so the batch logic is tested without a network or a
 * database (nutritionBackfill_test.ts). backfill-nutrition/index.ts wires in Supabase.
 */

import { AppError } from '../../core/errors.ts';
import type { LlmUsageSnapshot } from '../../llm/pricing.ts';
import type { RecipeNutrition } from '../nutrition.ts';
import type { Ingredient, Instruction } from '../recipeEditTypes.ts';

export const MAX_NUTRITION_BACKFILL_BATCH = 20;

export type NutritionBackfillTable = 'recipe_cards' | 'recipes';

export interface PendingNutritionRow {
  id: string;
  title: string;
  servings: number;
  calories: number;
  ingredients: Ingredient[];
  instructions: Instruction[];
}

export interface NutritionBackfillDb {
  /**
   * Rows with calories, no nutrition and id > after, ordered by id, at most `limit`. On `recipes`,
   * rows whose calories the user set by hand are left out: they show no macros.
   */
  fetchPending(after: string | null, limit: number): Promise<PendingNutritionRow[]>;
  /** Rows still to do, for a dry run. */
  countPending(): Promise<number>;
  /**
   * Writes only while the row still has no nutrition and the same calories; false when the row
   * changed between our read and our write.
   */
  saveNutrition(id: string, calories: number, nutrition: RecipeNutrition): Promise<boolean>;
}

export type EstimateNutritionFn = (
  row: PendingNutritionRow,
) => Promise<{ nutrition: RecipeNutrition | null; usage: LlmUsageSnapshot | null }>;

export type NutritionBackfillResult = {
  scanned: number;
  updated: number;
  /** Rows the task could not split (failed call, or macros that don't fit). They stay NULL. */
  stillNull: number;
  /** Rows that changed between our read and our write. */
  skipped: number;
  /** Pass this as `after` for the next batch; null when done. */
  nextCursor: string | null;
  usages: LlmUsageSnapshot[];
  errors: string[];
};

export function clampNutritionBatchSize(value: unknown): number {
  const n = typeof value === 'number' && Number.isInteger(value) ? value : MAX_NUTRITION_BACKFILL_BATCH;
  return Math.min(Math.max(n, 1), MAX_NUTRITION_BACKFILL_BATCH);
}

export function isNutritionBackfillTable(value: unknown): value is NutritionBackfillTable {
  return value === 'recipe_cards' || value === 'recipes';
}

/** OpenRouter answers 402 when the prepaid balance is spent (FetchError details.status). */
function isOutOfCredit(error: unknown): boolean {
  if (error instanceof AppError && error.details?.status === 402) return true;
  return error instanceof Error && /status=402\b/.test(error.message);
}

/** Runs one batch. Never throws for a single bad row; a failed row is reported and stays NULL. */
export async function runNutritionBackfillBatch(
  db: NutritionBackfillDb,
  estimate: EstimateNutritionFn,
  options: { after: string | null; limit: number },
): Promise<NutritionBackfillResult> {
  const rows = await db.fetchPending(options.after, options.limit);
  const result: NutritionBackfillResult = {
    scanned: rows.length,
    updated: 0,
    stillNull: 0,
    skipped: 0,
    nextCursor: rows.length === options.limit ? rows[rows.length - 1].id : null,
    usages: [],
    errors: [],
  };

  for (const row of rows) {
    let nutrition: RecipeNutrition | null;
    try {
      const estimated = await estimate(row);
      if (estimated.usage) result.usages.push(estimated.usage);
      nutrition = estimated.nutrition;
    } catch (error) {
      result.stillNull += 1;
      result.errors.push(`${row.id}: ${error instanceof Error ? error.message : String(error)}`);
      // Out of credit: every later call would fail too.
      if (isOutOfCredit(error)) {
        result.nextCursor = null;
        result.errors.push('stopped: the model provider reported 402 (out of credit)');
        break;
      }
      continue;
    }
    if (nutrition === null) {
      result.stillNull += 1;
      continue;
    }
    try {
      if (await db.saveNutrition(row.id, row.calories, nutrition)) result.updated += 1;
      else result.skipped += 1;
    } catch (error) {
      result.stillNull += 1;
      result.errors.push(`${row.id}: save failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return result;
}
