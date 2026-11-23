/**
 * One-time backfill of blurry recipe covers saved before PIN-176.
 *
 * Until 2026-11-23 imports kept the smallest picture a source offered (TikTok's 300×400 preview, a
 * recipe site's 225×225 thumbnail, Instagram's 640 crop). For each Hub card, and then each saved
 * recipe whose cover no card shares, this measures the cover it has. A cover already 720 or more on
 * its short side is left alone, so no paid lookup is spent on it. Otherwise the source's pictures are
 * read again and the largest is stored, but only when it is larger than the cover it replaces. Every
 * card and saved recipe showing the old cover gets the new one.
 *
 * The database and the network are passed in, so the batch logic is tested without either
 * (coverBackfill_test.ts). backfill-covers/index.ts wires in Supabase.
 */

import { type ImageSize, SHARP_SHORT_SIDE, shortSide } from './imageSize.ts';

export type CoverPlatform = 'tiktok' | 'instagram' | 'web';
export type CoverSource = 'cards' | 'recipes';

export const COVER_PLATFORMS: readonly CoverPlatform[] = ['tiktok', 'instagram', 'web'];
export const MAX_COVER_BATCH = 8;
export const DEFAULT_COVER_BATCH = 5;

export interface CoverRow {
  id: string;
  platform: CoverPlatform;
  originalUrl: string | null;
  imageUrl: string;
}

export interface CoverBackfillDeps {
  /** Rows of `source` on `platform` with a cover that isn't drawn, id > after, by id, at most `limit`. */
  fetchRows(source: CoverSource, platform: CoverPlatform, after: string | null, limit: number): Promise<CoverRow[]>;
  /** Of these cover URLs, the ones a Hub card shows (saved recipes with them were done with the card). */
  coversOnCards(urls: string[]): Promise<Set<string>>;
  /** The size of the cover as it is now; null when it can't be downloaded or read. */
  measure(url: string): Promise<ImageSize | null>;
  /** The source's pictures, best first. May spend a ScrapeCreators credit (TikTok, Instagram). */
  candidates(row: CoverRow): Promise<string[]>;
  /** Stores the largest picture when its short side is above `minShortSide`; undefined otherwise. */
  store(row: CoverRow, candidates: string[], minShortSide: number): Promise<string | undefined>;
  /** Points every card and saved recipe showing `oldUrl` at `newUrl`. */
  replace(oldUrl: string, newUrl: string): Promise<{ cards: number; recipes: number }>;
}

export type CoverOutcome =
  | 'updated'
  | 'already_sharp'
  | 'not_larger'
  | 'no_source'
  | 'on_card'
  | 'failed';

export interface CoverBackfillResult {
  scanned: number;
  counts: Record<CoverOutcome, number>;
  /** Cards and saved recipes that now show a sharper cover. */
  rowsUpdated: { cards: number; recipes: number };
  /** Paid source lookups made (TikTok and Instagram cost one ScrapeCreators credit each). */
  lookups: number;
  nextCursor: string | null;
  details: { id: string; outcome: CoverOutcome; from?: string | null; error?: string }[];
}

export function clampCoverBatch(value: unknown): number {
  const n = typeof value === 'number' && Number.isInteger(value) ? value : DEFAULT_COVER_BATCH;
  return Math.min(Math.max(n, 1), MAX_COVER_BATCH);
}

const sizeLabel = (size: ImageSize | null) => (size ? `${size.width}x${size.height}` : null);

/** Runs one batch. Never throws for a single row; a failed row is reported and left as it was. */
export async function runCoverBackfillBatch(
  deps: CoverBackfillDeps,
  options: { source: CoverSource; platform: CoverPlatform; after: string | null; limit: number },
): Promise<CoverBackfillResult> {
  const rows = await deps.fetchRows(options.source, options.platform, options.after, options.limit);
  const result: CoverBackfillResult = {
    scanned: rows.length,
    counts: { updated: 0, already_sharp: 0, not_larger: 0, no_source: 0, on_card: 0, failed: 0 },
    rowsUpdated: { cards: 0, recipes: 0 },
    lookups: 0,
    nextCursor: rows.length === options.limit ? rows[rows.length - 1].id : null,
    details: [],
  };
  const onCards = options.source === 'recipes' ? await deps.coversOnCards(rows.map((row) => row.imageUrl)) : new Set();
  // Several saved recipes can share one cover; it is looked up once per batch.
  const done = new Map<string, CoverOutcome>();

  for (const row of rows) {
    const note = (outcome: CoverOutcome, extra: { from?: string | null; error?: string } = {}) => {
      result.counts[outcome]++;
      result.details.push({ id: row.id, outcome, ...extra });
    };

    if (onCards.has(row.imageUrl)) {
      note('on_card');
      continue;
    }
    const earlier = done.get(row.imageUrl);
    if (earlier) {
      note(earlier === 'updated' ? 'updated' : earlier);
      continue;
    }
    if (!row.originalUrl) {
      note('no_source');
      continue;
    }

    try {
      const before = await deps.measure(row.imageUrl);
      const short = shortSide(before);
      if (short >= SHARP_SHORT_SIDE) {
        done.set(row.imageUrl, 'already_sharp');
        note('already_sharp', { from: sizeLabel(before) });
        continue;
      }

      if (row.platform !== 'web') result.lookups++;
      const candidates = await deps.candidates(row);
      if (candidates.length === 0) {
        done.set(row.imageUrl, 'no_source');
        note('no_source', { from: sizeLabel(before) });
        continue;
      }

      const stored = await deps.store(row, candidates, short);
      if (!stored) {
        done.set(row.imageUrl, 'not_larger');
        note('not_larger', { from: sizeLabel(before) });
        continue;
      }

      const replaced = await deps.replace(row.imageUrl, stored);
      result.rowsUpdated.cards += replaced.cards;
      result.rowsUpdated.recipes += replaced.recipes;
      done.set(row.imageUrl, 'updated');
      note('updated', { from: sizeLabel(before) });
    } catch (error) {
      done.set(row.imageUrl, 'failed');
      note('failed', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  return result;
}
