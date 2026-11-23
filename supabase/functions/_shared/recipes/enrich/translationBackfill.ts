/**
 * Redoes cached translations made by an older translator (PIN-53). A `recipe_translations` row whose
 * `translation_version` is missing or below `TRANSLATION_VERSION` is translated again from its recipe's current
 * text and saved with the new version. The app does the same lazily on open; this clears the backlog in one go.
 *
 * The database and the task are passed in, so the batch logic is tested without a network or a database
 * (translationBackfill_test.ts). backfill-translations/index.ts wires in Supabase.
 */

import { AppError } from '../../core/errors.ts';
import type { LlmUsageSnapshot } from '../../llm/pricing.ts';
import type { TranslatedRecipe, TranslateLanguageCode, TranslateRecipeInput } from '../translateRecipe.ts';

export const MAX_TRANSLATION_BACKFILL_BATCH = 10;
/** Rough cost per row on GPT-6.1 Sol (PIN-53 eval: $0.0044 per recipe), for the dry run's estimate. */
export const TRANSLATION_COST_PER_ROW_USD = 0.005;

export interface StaleTranslationRow {
  recipeId: string;
  languageCode: string;
  translationVersion: number | null;
  source: Omit<TranslateRecipeInput, 'targetLanguage'>;
}

/** Where the last batch stopped: rows are ordered by recipe id, then language. */
export type TranslationCursor = { recipeId: string; languageCode: string };

export interface TranslationBackfillDb {
  /** Stale rows after `after`, ordered by (recipe id, language), at most `limit`. */
  fetchStale(after: TranslationCursor | null, limit: number): Promise<StaleTranslationRow[]>;
  /** Stale rows by language, for a dry run. */
  countStale(): Promise<Record<string, number>>;
  /** Writes only while the row is still stale; false when it changed (the app redid it) since the read. */
  saveTranslation(
    row: Pick<StaleTranslationRow, 'recipeId' | 'languageCode'>,
    content: Pick<TranslatedRecipe, 'title' | 'ingredients' | 'instructions'>,
    version: number,
  ): Promise<boolean>;
}

export type TranslateFn = (input: TranslateRecipeInput) => Promise<TranslatedRecipe>;

export type TranslationBackfillResult = {
  scanned: number;
  updated: number;
  /** Rows the model could not translate; they stay as they were and are tried again next run. */
  failed: number;
  /** Rows that changed between our read and our write, or whose language we don't translate. */
  skipped: number;
  nextCursor: TranslationCursor | null;
  usages: LlmUsageSnapshot[];
  errors: string[];
};

export function clampTranslationBatchSize(value: unknown): number {
  const n = typeof value === 'number' && Number.isInteger(value) ? value : MAX_TRANSLATION_BACKFILL_BATCH;
  return Math.min(Math.max(n, 1), MAX_TRANSLATION_BACKFILL_BATCH);
}

function isOutOfCredit(error: unknown): boolean {
  if (error instanceof AppError && error.details?.status === 402) return true;
  return error instanceof Error && /status=402\b|requires at least \$?1/i.test(error.message);
}

/** Runs one batch. Never throws for a single bad row. Stops at the first 402: every later call would fail too. */
export async function runTranslationBackfillBatch(
  db: TranslationBackfillDb,
  translate: TranslateFn,
  options: {
    after: TranslationCursor | null;
    limit: number;
    version: number;
    isLanguage: (code: string) => code is TranslateLanguageCode;
  },
): Promise<TranslationBackfillResult> {
  const rows = await db.fetchStale(options.after, options.limit);
  const last = rows[rows.length - 1];
  const result: TranslationBackfillResult = {
    scanned: rows.length,
    updated: 0,
    failed: 0,
    skipped: 0,
    nextCursor: rows.length === options.limit && last ? { recipeId: last.recipeId, languageCode: last.languageCode } : null,
    usages: [],
    errors: [],
  };

  for (const row of rows) {
    if (!options.isLanguage(row.languageCode)) {
      result.skipped += 1;
      continue;
    }
    let translated: TranslatedRecipe;
    try {
      translated = await translate({ ...row.source, targetLanguage: row.languageCode });
      if (translated.usage) result.usages.push(translated.usage);
    } catch (error) {
      result.failed += 1;
      result.errors.push(`${row.recipeId}/${row.languageCode}: ${error instanceof Error ? error.message : String(error)}`);
      if (isOutOfCredit(error)) {
        result.nextCursor = null;
        result.errors.push('stopped: the model provider reported 402 (out of credit)');
        break;
      }
      continue;
    }
    try {
      const saved = await db.saveTranslation(row, translated, options.version);
      if (saved) result.updated += 1;
      else result.skipped += 1;
    } catch (error) {
      result.failed += 1;
      result.errors.push(`${row.recipeId}/${row.languageCode}: save failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return result;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reads `{ recipe_id, language_code }` from a request; null when absent, undefined when malformed. */
export function parseTranslationCursor(value: unknown): TranslationCursor | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object' || Array.isArray(value)) return undefined;
  const { recipe_id, language_code } = value as Record<string, unknown>;
  if (typeof recipe_id !== 'string' || !UUID.test(recipe_id)) return undefined;
  if (typeof language_code !== 'string' || !/^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/.test(language_code)) return undefined;
  return { recipeId: recipe_id, languageCode: language_code };
}
