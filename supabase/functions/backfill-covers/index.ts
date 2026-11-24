import { parseUuidCursor, readBackfillBody } from '../_shared/core/backfillRequest.ts';
import { handler, HttpError } from '../_shared/core/handler.ts';
import { safeFetch } from '../_shared/core/safeFetch.ts';
import type { Db } from '../_shared/core/supabaseAdmin.ts';
import {
  clampCoverBatch,
  COVER_PLATFORMS,
  type CoverBackfillDeps,
  type CoverPlatform,
  type CoverRow,
  type CoverSource,
  runCoverBackfillBatch,
} from '../_shared/extraction/coverBackfill.ts';
import { readImageSize } from '../_shared/extraction/imageSize.ts';
import { persistSocialThumbnail } from '../_shared/extraction/persistThumbnail.ts';
import { extractInstagramId, extractTikTokId } from '../_shared/extraction/platform.ts';
import { extractInstagramThumbnails, fetchInstagramMediaWithFallback } from '../_shared/extraction/sources/instagram.ts';
import { fetchTikTokThumbnails } from '../_shared/extraction/sources/tiktok.ts';
import { fetchPageImageCandidates } from '../_shared/extraction/webRecipe.ts';

interface RequestBody {
  platform?: string;
  /** "cards" (default) or "recipes": saved recipes whose cover no Hub card shares. */
  source?: string;
  /** next_cursor from the previous response; omit to start. */
  after?: string | null;
  /** 1–8, default 5. */
  limit?: number;
  /** Only count the rows of this platform and source; nothing is downloaded or looked up. */
  dry_run?: boolean;
}

/** A header is all `measure` needs; most covers fit whole. */
const MEASURE_BYTES = 256 * 1024;

const TABLE: Record<CoverSource, 'recipe_cards' | 'recipes'> = { cards: 'recipe_cards', recipes: 'recipes' };

/** The request, checked in the old order. A body that isn't an object (`null`) throws a TypeError: a 500, as before. */
function parseRequest(raw: unknown) {
  const body = raw as RequestBody;
  const platform = body.platform as CoverPlatform;
  if (!COVER_PLATFORMS.includes(platform)) {
    throw HttpError.legacy(400, `platform must be one of ${COVER_PLATFORMS.join(', ')}`);
  }
  const source: CoverSource = body.source === 'recipes' ? 'recipes' : 'cards';
  const after = parseUuidCursor(body.after);
  return { platform, source, after, dryRun: body.dry_run === true, limit: body.limit };
}

function referer(platform: CoverPlatform): Record<string, string> {
  if (platform === 'instagram') return { Referer: 'https://www.instagram.com/' };
  if (platform === 'tiktok') return { Referer: 'https://www.tiktok.com/' };
  return {};
}

/** The first `maxBytes` of a body (the header is at the start), then the rest is dropped. */
async function readPrefix(res: Response, maxBytes: number): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array(0);
  const reader = res.body.getReader();
  const out = new Uint8Array(maxBytes);
  let length = 0;
  while (length < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    const take = Math.min(value.byteLength, maxBytes - length);
    out.set(value.subarray(0, take), length);
    length += take;
  }
  await reader.cancel().catch(() => {});
  return out.subarray(0, length);
}

function contentIdOf(row: CoverRow): string | null {
  if (!row.originalUrl) return null;
  if (row.platform === 'tiktok') return extractTikTokId(row.originalUrl);
  if (row.platform === 'instagram') return extractInstagramId(row.originalUrl);
  return null;
}

function coverDeps(admin: Db): CoverBackfillDeps {
  return {
    async fetchRows(source, platform, after, limit) {
      let query = admin
        .from(TABLE[source])
        .select('id, platform, original_url, image_url')
        .eq('platform', platform)
        .eq('image_generated', false)
        .not('image_url', 'is', null)
        .order('id', { ascending: true })
        .limit(limit);
      if (after) query = query.gt('id', after);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => ({
        id: row.id,
        platform,
        originalUrl: row.original_url,
        imageUrl: row.image_url as string,
      }));
    },
    async coversOnCards(urls) {
      if (urls.length === 0) return new Set();
      const { data, error } = await admin.from('recipe_cards').select('image_url').in('image_url', urls);
      if (error) throw new Error(error.message);
      return new Set((data ?? []).map((row) => row.image_url as string));
    },
    async measure(url) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      try {
        const res = await safeFetch(url, { signal: controller.signal, headers: { Accept: 'image/*' } });
        if (!res.ok) {
          await res.body?.cancel();
          return null;
        }
        return readImageSize(await readPrefix(res, MEASURE_BYTES));
      } catch {
        return null;
      } finally {
        clearTimeout(timeout);
      }
    },
    async candidates(row) {
      if (!row.originalUrl) return [];
      if (row.platform === 'web') return await fetchPageImageCandidates(row.originalUrl);
      if (row.platform === 'tiktok') {
        const id = extractTikTokId(row.originalUrl);
        return id ? await fetchTikTokThumbnails(id) : [];
      }
      const { media } = await fetchInstagramMediaWithFallback(row.originalUrl);
      return extractInstagramThumbnails(media);
    },
    async store(row, candidates, minShortSide) {
      return await persistSocialThumbnail({
        sourceUrl: candidates[0],
        alternates: candidates.slice(1),
        platform: row.platform,
        contentId: contentIdOf(row),
        minShortSide,
      });
    },
    async replace(oldUrl, newUrl) {
      // `image_generated = false` keeps a drawing a cook chose; `image_url = old` makes a second run a no-op.
      const cards = await admin
        .from('recipe_cards')
        .update({ image_url: newUrl })
        .eq('image_url', oldUrl)
        .eq('image_generated', false)
        .select('id');
      if (cards.error) throw new Error(cards.error.message);
      const recipes = await admin
        .from('recipes')
        .update({ image_url: newUrl })
        .eq('image_url', oldUrl)
        .eq('image_generated', false)
        .select('id');
      if (recipes.error) throw new Error(recipes.error.message);
      return { cards: cards.data?.length ?? 0, recipes: recipes.data?.length ?? 0 };
    },
  };
}

/**
 * Admin only. POST { platform, source?, after?, limit?, dry_run? } gives blurry covers saved before
 * PIN-176 the sharpest picture their source has, one batch per call. Call again with
 * `after: next_cursor` until it is null; run `source: "cards"` first, then `"recipes"`.
 * TikTok and Instagram spend one ScrapeCreators credit per cover that is below 720 px.
 */
handler(
  {
    name: 'backfill-covers',
    auth: 'admin',
    // Read below: Content-Length 0 is `{}`, an empty body without one is invalid JSON (readBackfillBody).
    body: 'none',
    legacyErrorShape: true,
    errors: { authInvalid: HttpError.legacy(401, 'Sign in required') },
  },
  async ({ req, user, admin }) => {
    const { platform, source, after, dryRun, limit } = parseRequest(await readBackfillBody(req));

    try {
      if (dryRun) {
        const { count, error } = await admin
          .from(TABLE[source])
          .select('id', { count: 'exact', head: true })
          .eq('platform', platform)
          .eq('image_generated', false)
          .not('image_url', 'is', null);
        if (error) throw new Error(error.message);
        return { dry_run: true, platform, source, rows: count ?? 0 };
      }

      const started = Date.now();
      const result = await runCoverBackfillBatch(coverDeps(admin), {
        source,
        platform,
        after,
        limit: clampCoverBatch(limit),
      });
      console.log('[backfill-covers] batch', {
        userId: user.id,
        platform,
        source,
        after,
        ms: Date.now() - started,
        ...result,
      });
      return {
        platform,
        source,
        scanned: result.scanned,
        counts: result.counts,
        rows_updated: result.rowsUpdated,
        lookups: result.lookups,
        next_cursor: result.nextCursor,
        details: result.details,
      };
    } catch (error) {
      console.error('[backfill-covers] batch failed', error);
      throw HttpError.legacy(500, 'Backfill batch failed');
    }
  },
);
