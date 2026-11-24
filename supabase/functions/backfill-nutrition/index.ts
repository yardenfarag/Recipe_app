import { parseUuidCursor, readBackfillBody } from '../_shared/core/backfillRequest.ts';
import { handler, HttpError } from '../_shared/core/handler.ts';
import { type Db, toJson } from '../_shared/core/supabaseAdmin.ts';
import {
  clampNutritionBatchSize,
  isNutritionBackfillTable,
  type NutritionBackfillDb,
  type NutritionBackfillTable,
  type PendingNutritionRow,
  runNutritionBackfillBatch,
} from '../_shared/recipes/enrich/nutritionBackfill.ts';
import { estimateRecipeNutrition } from '../_shared/recipes/recipeEstimates.ts';

interface RequestBody {
  /** recipe_cards (default, run first) or recipes. */
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
  const table = body.table ?? 'recipe_cards';
  if (!isNutritionBackfillTable(table)) throw HttpError.legacy(400, 'table must be recipe_cards or recipes');
  const after = parseUuidCursor(body.after);
  return { table, after, dryRun: body.dry_run === true, limit: body.limit };
}

function supabaseNutritionDb(admin: Db, table: NutritionBackfillTable): NutritionBackfillDb {
  // Both tables have these columns; typed as recipes so one set of filters serves both.
  const from = () => admin.from(table as 'recipes');
  // A hand-set calorie count shows no macros (PIN-80); cards have no locked fields.
  const skipsLocked = table === 'recipes';
  return {
    async fetchPending(after, limit) {
      let query = from()
        .select('id, title, servings, calories, ingredients, instructions')
        .not('calories', 'is', null)
        .is('nutrition', null);
      if (skipsLocked) query = query.not('locked_fields', 'cs', '{calories}');
      if (after) query = query.gt('id', after);
      query = query.order('id', { ascending: true }).limit(limit);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as PendingNutritionRow[];
    },
    async countPending() {
      let query = from().select('id', { count: 'exact', head: true }).not('calories', 'is', null).is('nutrition', null);
      if (skipsLocked) query = query.not('locked_fields', 'cs', '{calories}');
      const { count, error } = await query;
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    async saveNutrition(id, calories, nutrition) {
      // A no-op when the row changed since the read: new calories, or macros from a new estimate.
      const { data, error } = await from()
        .update({ nutrition: toJson(nutrition) })
        .eq('id', id)
        .eq('calories', calories)
        .is('nutrition', null)
        .select('id');
      if (error) throw new Error(error.message);
      return (data ?? []).length > 0;
    },
  };
}

/**
 * Admin only. POST { table?, after?, limit?, dry_run? } fills `nutrition` on rows saved before
 * PIN-80, one batch per call, splitting each row's stored calories. Run `recipe_cards` first, then
 * `recipes`. Call again with `after: next_cursor` until it is null. Check the OpenRouter balance
 * before a full run: about 0.0002 dollars a row on recipe_estimates (Luna).
 */
handler(
  {
    name: 'backfill-nutrition',
    auth: 'admin',
    // Read below: Content-Length 0 is `{}`, an empty body without one is invalid JSON (readBackfillBody).
    body: 'none',
    legacyErrorShape: true,
    errors: { authInvalid: HttpError.legacy(401, 'Sign in required') },
  },
  async ({ req, admin, log }) => {
    const { table, after, dryRun, limit } = parseRequest(await readBackfillBody(req));

    const db = supabaseNutritionDb(admin, table);
    const started = Date.now();
    try {
      if (dryRun) {
        return { dry_run: true, table, pending: await db.countPending() };
      }

      const result = await runNutritionBackfillBatch(
        db,
        (row) =>
          estimateRecipeNutrition({
            title: row.title,
            servings: Number(row.servings) || 1,
            ingredients: Array.isArray(row.ingredients) ? row.ingredients : [],
            instructions: Array.isArray(row.instructions) ? row.instructions : [],
            calories: row.calories,
          }),
        { after, limit: clampNutritionBatchSize(limit) },
      );

      await log.usage({
        action: 'nutrition_backfill',
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
      console.error('[backfill-nutrition] batch failed', error);
      throw HttpError.legacy(500, 'Backfill batch failed');
    }
  },
);
