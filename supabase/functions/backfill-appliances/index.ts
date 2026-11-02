import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

import type { RecipeAppliance } from '../_shared/appliances.ts';
import {
  type BackfillDb,
  type BackfillTable,
  clampBatchSize,
  isBackfillTable,
  type PendingRow,
  runAppliancesBackfillBatch,
} from '../_shared/appliancesBackfill.ts';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { deriveRecipeAppliances } from '../_shared/recipeAppliances.ts';
import { createAuthedSupabase } from '../_shared/recipeLookup.ts';
import { createServiceSupabase } from '../_shared/supabaseAdmin.ts';
import { logUsageEvent } from '../_shared/usageLog.ts';

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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function supabaseBackfillDb(admin: SupabaseClient): BackfillDb {
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
        .update({ appliances })
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
Deno.serve(async (req) => {
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
    console.error('[backfill-appliances] admin check failed', adminError);
    return jsonResponse({ error: 'Could not verify admin' }, 500);
  }
  if (isAdmin !== true) return jsonResponse({ error: 'Admins only' }, 403);

  const table = body.table === undefined ? 'recipes' : body.table;
  if (!isBackfillTable(table)) return jsonResponse({ error: 'table must be recipes or recipe_cards' }, 400);
  const after = body.after ?? null;
  if (after !== null && (typeof after !== 'string' || !UUID.test(after))) {
    return jsonResponse({ error: 'after must be a next_cursor value' }, 400);
  }

  const db = supabaseBackfillDb(admin);
  const started = Date.now();
  try {
    if (body.dry_run === true) {
      return jsonResponse({ table, dry_run: true, pending: await db.countPending(table) });
    }

    const result = await runAppliancesBackfillBatch(db, (recipe) => deriveRecipeAppliances(recipe), {
      table,
      after,
      limit: clampBatchSize(body.limit),
    });

    await logUsageEvent(admin, {
      userId: user.id,
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
    console.error('[backfill-appliances] batch failed', error);
    return jsonResponse({ error: 'Backfill batch failed' }, 500);
  }
});
