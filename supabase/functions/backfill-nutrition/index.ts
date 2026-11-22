import { serve } from '../_shared/core/observe.ts';
import { type Db, toJson } from '../_shared/core/supabaseAdmin.ts';

import { corsHeaders, jsonResponse } from '../_shared/core/cors.ts';
import {
  clampNutritionBatchSize,
  isNutritionBackfillTable,
  type NutritionBackfillDb,
  type NutritionBackfillTable,
  type PendingNutritionRow,
  runNutritionBackfillBatch,
} from '../_shared/recipes/enrich/nutritionBackfill.ts';
import { estimateRecipeNutrition } from '../_shared/recipes/recipeEstimates.ts';
import { createAuthedSupabase } from '../_shared/core/recipeLookup.ts';
import { createServiceSupabase } from '../_shared/core/supabaseAdmin.ts';
import { logUsageEvent } from '../_shared/core/usageLog.ts';

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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
serve('backfill-nutrition', async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ error: 'Missing Authorization header' }, 401);

  let body: RequestBody = {};
  try {
    if (req.headers.get('content-length') !== '0') body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const authed = createAuthedSupabase(authHeader);
  const admin = createServiceSupabase();
  if (!authed || !admin) return jsonResponse({ error: 'Server misconfigured' }, 500);

  const {
    data: { user },
  } = await authed.auth.getUser();
  if (!user) return jsonResponse({ error: 'Sign in required' }, 401);

  const { data: isAdmin, error: adminError } = await authed.rpc('is_current_user_admin');
  if (adminError) {
    console.error('[backfill-nutrition] admin check failed', adminError);
    return jsonResponse({ error: 'Could not verify admin' }, 500);
  }
  if (isAdmin !== true) return jsonResponse({ error: 'Admins only' }, 403);

  const table = body.table ?? 'recipe_cards';
  if (!isNutritionBackfillTable(table)) {
    return jsonResponse({ error: 'table must be recipe_cards or recipes' }, 400);
  }
  const after = body.after ?? null;
  if (after !== null && (typeof after !== 'string' || !UUID.test(after))) {
    return jsonResponse({ error: 'after must be a next_cursor value' }, 400);
  }

  const db = supabaseNutritionDb(admin, table);
  const started = Date.now();
  try {
    if (body.dry_run === true) {
      return jsonResponse({ dry_run: true, table, pending: await db.countPending() });
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
      { after, limit: clampNutritionBatchSize(body.limit) },
    );

    await logUsageEvent(admin, {
      userId: user.id,
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

    return jsonResponse({
      table,
      scanned: result.scanned,
      updated: result.updated,
      still_null: result.stillNull,
      skipped: result.skipped,
      next_cursor: result.nextCursor,
      errors: result.errors.slice(0, 10),
    });
  } catch (error) {
    console.error('[backfill-nutrition] batch failed', error);
    return jsonResponse({ error: 'Backfill batch failed' }, 500);
  }
});
