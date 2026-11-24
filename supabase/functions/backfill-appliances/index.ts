import { parseUuidCursor, readBackfillBody } from '../_shared/core/backfillRequest.ts';
import { handler, HttpError } from '../_shared/core/handler.ts';
import { type Db, toJson } from '../_shared/core/supabaseAdmin.ts';
import type { RecipeAppliance } from '../_shared/recipes/enrich/appliances.ts';
import {
  type BackfillDb,
  type BackfillTable,
  clampBatchSize,
  isBackfillTable,
  type PendingRow,
  runAppliancesBackfillBatch,
} from '../_shared/recipes/enrich/appliancesBackfill.ts';
import { deriveRecipeAppliances } from '../_shared/recipes/enrich/recipeAppliances.ts';

interface RequestBody {
  /** recipes (default) or recipe_cards. */
  table?: string;
  /** next_cursor from the previous response; omit to start. */
  after?: string | null;
  /** 1–20, default 20. */
  limit?: number;
  /** Only count the rows still to do; no model calls. */
  dry_run?: boolean;
}

/** The request, checked in the old order. A body that isn't an object (`null`) throws a TypeError: a 500, as before. */
function parseRequest(raw: unknown) {
  const body = raw as RequestBody;
  const table = body.table === undefined ? 'recipes' : body.table;
  if (!isBackfillTable(table)) throw HttpError.legacy(400, 'table must be recipes or recipe_cards');
  const after = parseUuidCursor(body.after);
  return { table, after, dryRun: body.dry_run === true, limit: body.limit };
}

function supabaseBackfillDb(admin: Db): BackfillDb {
  return {
    async fetchPending(table, after, limit) {
      let query = admin
        .from(table)
        .select('id, title, ingredients, instructions')
        .is('appliances', null)
        .order('id', { ascending: true })
        .limit(limit);
      if (after) query = query.gt('id', after);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as PendingRow[];
    },
    async countPending(table) {
      const { count, error } = await admin.from(table).select('id', { count: 'exact', head: true }).is('appliances', null);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    async saveAppliances(table: BackfillTable, id: string, appliances: RecipeAppliance[]) {
      // `is null` makes the write a no-op if a user's remix or a new extract filled it first.
      const { data, error } = await admin
        .from(table)
        .update({ appliances: toJson(appliances) })
        .eq('id', id)
        .is('appliances', null)
        .select('id');
      if (error) throw new Error(error.message);
      return (data ?? []).length > 0;
    },
  };
}

/**
 * Admin only. POST { table?, after?, limit?, dry_run? } fills `appliances` on rows saved before
 * PIN-26, one batch per call (ADR 017 decision 8). Call again with `after: next_cursor` until it is
 * null, then do the same for table "recipe_cards". Costs users no credits.
 */
handler(
  {
    name: 'backfill-appliances',
    auth: 'admin',
    // Read below: Content-Length 0 is `{}`, an empty body without one is invalid JSON (readBackfillBody).
    body: 'none',
    legacyErrorShape: true,
    errors: { authInvalid: HttpError.legacy(401, 'Sign in required') },
  },
  async ({ req, admin, log }) => {
    const { table, after, dryRun, limit } = parseRequest(await readBackfillBody(req));

    const db = supabaseBackfillDb(admin);
    const started = Date.now();
    try {
      if (dryRun) {
        return { table, dry_run: true, pending: await db.countPending(table) };
      }

      const result = await runAppliancesBackfillBatch(db, (recipe) => deriveRecipeAppliances(recipe), {
        table,
        after,
        limit: clampBatchSize(limit),
      });

      await log.usage({
        action: 'appliances_backfill',
        status: result.errors.length > 0 ? 'partial' : 'ok',
        usages: result.usages,
        tokensCharged: 0,
        durationMs: Date.now() - started,
        metadata: {
          table,
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
        table,
        scanned: result.scanned,
        updated: result.updated,
        still_null: result.stillNull,
        skipped: result.skipped,
        next_cursor: result.nextCursor,
        errors: result.errors.slice(0, 10),
      };
    } catch (error) {
      console.error('[backfill-appliances] batch failed', error);
      throw HttpError.legacy(500, 'Backfill batch failed');
    }
  },
);
