import { parseUuidCursor, readBackfillBody } from '../_shared/core/backfillRequest.ts';
import { handler, HttpError } from '../_shared/core/handler.ts';
import type { Db } from '../_shared/core/supabaseAdmin.ts';
import {
  clampDietsBatchSize,
  type DietsBackfillDb,
  type PendingCard,
  runDietsBackfillBatch,
} from '../_shared/recipes/enrich/dietsBackfill.ts';
import { deriveRecipeDiets } from '../_shared/recipes/enrich/recipeDiets.ts';

interface RequestBody {
  /** next_cursor from the previous response; omit to start. */
  after?: string | null;
  /** 1–20, default 20. */
  limit?: number;
  /** Only count the cards still to do; no model calls. */
  dry_run?: boolean;
}

/** The request, checked in the old order. A body that isn't an object (`null`) throws a TypeError: a 500, as before. */
function parseRequest(raw: unknown) {
  const body = raw as RequestBody;
  const after = parseUuidCursor(body.after);
  return { after, dryRun: body.dry_run === true, limit: body.limit };
}

function supabaseDietsDb(admin: Db): DietsBackfillDb {
  return {
    async fetchPending(after, limit) {
      let query = admin
        .from('recipe_cards')
        .select('id, title, ingredients, instructions')
        .is('contains', null)
        .order('id', { ascending: true })
        .limit(limit);
      if (after) query = query.gt('id', after);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as PendingCard[];
    },
    async countPending() {
      const { count, error } = await admin
        .from('recipe_cards')
        .select('id', { count: 'exact', head: true })
        .is('contains', null);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    async saveDiets(id, diets, contains) {
      // `is null` makes the write a no-op if a new extract checked the card first.
      const { data, error } = await admin
        .from('recipe_cards')
        .update({ diets, contains })
        .eq('id', id)
        .is('contains', null)
        .select('id');
      if (error) throw new Error(error.message);
      return (data ?? []).length > 0;
    },
  };
}

/**
 * Admin only. POST { after?, limit?, dry_run? } fills `recipe_cards.diets` and `contains` on cards
 * not checked since PIN-180, one batch per call. Call again with `after: next_cursor` until it is null.
 * Each card is one model call: check the OpenRouter balance before a full run.
 */
handler(
  {
    name: 'backfill-diets',
    auth: 'admin',
    // Read below: Content-Length 0 is `{}`, an empty body without one is invalid JSON (readBackfillBody).
    body: 'none',
    legacyErrorShape: true,
    errors: { authInvalid: HttpError.legacy(401, 'Sign in required') },
  },
  async ({ req, admin, log }) => {
    const { after, dryRun, limit } = parseRequest(await readBackfillBody(req));

    const db = supabaseDietsDb(admin);
    const started = Date.now();
    try {
      if (dryRun) {
        return { dry_run: true, pending: await db.countPending() };
      }

      const result = await runDietsBackfillBatch(db, (recipe) => deriveRecipeDiets(recipe), {
        after,
        limit: clampDietsBatchSize(limit),
      });

      await log.usage({
        action: 'hub_diets_backfill',
        status: result.errors.length > 0 ? 'partial' : 'ok',
        usages: result.usages,
        tokensCharged: 0,
        durationMs: Date.now() - started,
        metadata: {
          after,
          scanned: result.scanned,
          updated: result.updated,
          still_null: result.stillNull,
          skipped: result.skipped,
          next_cursor: result.nextCursor,
          errors: result.errors.slice(0, 10),
        },
      });

      return {
        scanned: result.scanned,
        updated: result.updated,
        still_null: result.stillNull,
        skipped: result.skipped,
        next_cursor: result.nextCursor,
        errors: result.errors.slice(0, 10),
      };
    } catch (error) {
      console.error('[backfill-diets] batch failed', error);
      throw HttpError.legacy(500, 'Backfill batch failed');
    }
  },
);
