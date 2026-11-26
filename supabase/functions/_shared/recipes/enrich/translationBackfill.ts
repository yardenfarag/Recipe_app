/**
 * Redoes cached translations made by an older translator (PIN-53), and (PIN-77) fills the app languages Hub cards
 * and Library recipes don't have yet (runMissingTranslationBatch, below). A `recipe_translations` row whose
 * `translation_version` is missing or below `TRANSLATION_VERSION` is translated again from its recipe's current
 * text and saved with the new version. The app does the same lazily on open; this clears the backlog in one go.
 *
 * The database and the task are passed in, so the batch logic is tested without a network or a database
 * (translationBackfill_test.ts). backfill-translations/index.ts wires in Supabase.
 */

import { AppError } from '../../core/errors.ts';
import type { LlmUsageSnapshot } from '../../llm/pricing.ts';
import type { TranslatedRecipe, TranslateLanguageCode, TranslateRecipeInput } from '../translateRecipe.ts';
import {
  type AppLanguage,
  languagesToTranslate,
  sourceLanguageOf,
  type StoredRecipeText,
  type TranslationContent,
  translateOrKeep,
  type TranslationSource,
  translationSourceFrom,
} from '../translationTargets.ts';

export const MAX_TRANSLATION_BACKFILL_BATCH = 10;
/** Rough cost per row on GPT-6.1 Sol (PIN-53 eval: $0.0044 per recipe), for the dry run's estimate. */
export const TRANSLATION_COST_PER_ROW_USD = 0.003; // GPT-6.1 Terra, 26 Nov 2026 eval: $0.0025, rounded up

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

// ── Missing languages (PIN-77) ────────────────────────────────────────────────
// Every visible Hub card and every Library recipe in every app language it lacks, except its own. One item (a card or
// a recipe) is one to four model calls, made in parallel; items run one after the other, so a batch stays well inside
// the Edge Function's time limit.

export type MissingTranslationTarget = 'cards' | 'recipes';
export const MAX_MISSING_TRANSLATION_BATCH = 5;
export const DEFAULT_MISSING_TRANSLATION_BATCH = 3;
/** Rows read per batch to find the ones still missing a language (most are done after a first pass). */
export const MISSING_TRANSLATION_SCAN = 100;
/** No new item starts after this long, so the call answers before the Edge Function's limit. */
export const MISSING_TRANSLATION_BUDGET_MS = 90_000;

export interface MissingTranslationItem {
  id: string;
  text: StoredRecipeText;
  /** The app languages it already has (for cards, made by the current translator). */
  have: string[];
}

export interface MissingTranslationDb {
  /** Items after `after`, in id order, at most `limit`. */
  fetchItems(after: string | null, limit: number): Promise<MissingTranslationItem[]>;
  /** Copies a matching Hub card's translations (free); the languages copied by item id. Library recipes only. */
  copyFromCards?(ids: string[]): Promise<Record<string, string[]>>;
  /** Writes one translation; false when one appeared meanwhile and was kept. */
  save(id: string, language: AppLanguage, content: TranslationContent, version: number): Promise<boolean>;
}

export type MissingTranslationResult = {
  /** Rows read. */
  scanned: number;
  /** Rows that were missing a language and were translated in this batch. */
  items: number;
  /** Translations written. */
  translated: number;
  /** Translations copied from a Hub card with the same text, for free. */
  copied: number;
  failed: number;
  /** Translations that appeared between our read and our write (kept). */
  skipped: number;
  nextCursor: string | null;
  usages: LlmUsageSnapshot[];
  errors: string[];
};

export function clampMissingTranslationBatchSize(value: unknown): number {
  const n = typeof value === 'number' && Number.isInteger(value) ? value : DEFAULT_MISSING_TRANSLATION_BATCH;
  return Math.min(Math.max(n, 1), MAX_MISSING_TRANSLATION_BATCH);
}

/** The text to translate and the languages it lacks; null when there is nothing to do. */
export function missingTranslationsFor(
  item: MissingTranslationItem,
): { source: TranslationSource; languages: AppLanguage[] } | null {
  const source = translationSourceFrom(item.text);
  if (!source) return null;
  const languages = languagesToTranslate(sourceLanguageOf(item.text, source), item.have);
  return languages.length > 0 ? { source, languages } : null;
}

/** For a dry run: what is missing, by language, read page by page. No model calls, no writes. */
export async function countMissingTranslations(
  db: MissingTranslationDb,
  pageSize = MISSING_TRANSLATION_SCAN,
): Promise<{ items: number; missing: number; byLanguage: Record<string, number> }> {
  const byLanguage: Record<string, number> = {};
  let items = 0;
  let missing = 0;
  let after: string | null = null;
  for (;;) {
    const page = await db.fetchItems(after, pageSize);
    for (const item of page) {
      const todo = missingTranslationsFor(item);
      if (!todo) continue;
      items += 1;
      missing += todo.languages.length;
      for (const language of todo.languages) byLanguage[language] = (byLanguage[language] ?? 0) + 1;
    }
    if (page.length < pageSize) break;
    after = page[page.length - 1].id;
  }
  return { items, missing, byLanguage };
}

/**
 * Runs one batch: up to `limit` items missing a language, each one's languages in parallel. Never throws for a single
 * bad item. Stops at the first 402 (every later call would fail too), and before an item that would start after the
 * time budget.
 */
export async function runMissingTranslationBatch(
  db: MissingTranslationDb,
  translate: TranslateFn,
  options: {
    after: string | null;
    limit: number;
    version: number;
    scan?: number;
    budgetMs?: number;
    now?: () => number;
  },
): Promise<MissingTranslationResult> {
  const scan = options.scan ?? MISSING_TRANSLATION_SCAN;
  const now = options.now ?? Date.now;
  const started = now();
  const rows = await db.fetchItems(options.after, scan);
  const result: MissingTranslationResult = {
    scanned: rows.length,
    items: 0,
    translated: 0,
    copied: 0,
    failed: 0,
    skipped: 0,
    nextCursor: rows.length === scan ? rows[rows.length - 1].id : null,
    usages: [],
    errors: [],
  };

  // Free first: a Library recipe from a translated Hub card takes the card's translations.
  if (db.copyFromCards) {
    const ids = rows.filter((row) => missingTranslationsFor(row)).map((row) => row.id);
    if (ids.length > 0) {
      const copied = await db.copyFromCards(ids);
      for (const row of rows) {
        const languages = copied[row.id] ?? [];
        result.copied += languages.length;
        row.have = [...row.have, ...languages];
      }
    }
  }

  let previous: string | null = options.after;
  for (const row of rows) {
    const todo = missingTranslationsFor(row);
    if (!todo) {
      previous = row.id;
      continue;
    }
    if (result.items === options.limit || now() - started > (options.budgetMs ?? MISSING_TRANSLATION_BUDGET_MS)) {
      result.nextCursor = previous;
      break;
    }
    result.items += 1;
    let outOfCredit = false;
    await Promise.all(todo.languages.map(async (language) => {
      let translated: TranslatedRecipe;
      try {
        translated = await translateOrKeep(todo.source, language, translate);
        if (translated.usage) result.usages.push(translated.usage);
      } catch (error) {
        result.failed += 1;
        result.errors.push(`${row.id}/${language}: ${error instanceof Error ? error.message : String(error)}`);
        if (isOutOfCredit(error)) outOfCredit = true;
        return;
      }
      try {
        const saved = await db.save(row.id, language, translated, options.version);
        if (saved) result.translated += 1;
        else result.skipped += 1;
      } catch (error) {
        result.failed += 1;
        result.errors.push(`${row.id}/${language}: save failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }));
    previous = row.id;
    if (outOfCredit) {
      result.nextCursor = null;
      result.errors.push('stopped: the model provider reported 402 (out of credit)');
      break;
    }
  }
  return result;
}
