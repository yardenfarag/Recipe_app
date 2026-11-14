import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import {
  clampDietsBatchSize,
  type DietsBackfillDb,
  type PendingCard,
  runDietsBackfillBatch,
} from '../_shared/dietsBackfill.ts';
import { deriveRecipeDiets } from '../_shared/recipeDiets.ts';
import { createAuthedSupabase } from '../_shared/recipeLookup.ts';
import { createServiceSupabase } from '../_shared/supabaseAdmin.ts';
import { logUsageEvent } from '../_shared/usageLog.ts';

interface RequestBody {
  /** next_cursor from the previous response; omit to start. */
  after?: string | null;
  /** 1–20, default 20. */
  limit?: number;
  /** Only count the cards still to do; no model calls. */
  dry_run?: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function supabaseDietsDb(admin: SupabaseClient): DietsBackfillDb {
  return {
    async fetchPending(after, limit) {
      let query = admin
        .from('recipe_cards')
        .select('id, title, ingredients, instructions')
        .is('diets', null)
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
        .is('diets', null);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    async saveDiets(id, diets) {
      // `is null` makes the write a no-op if a new extract checked the card first.
      const { data, error } = await admin
        .from('recipe_cards')
        .update({ diets })
        .eq('id', id)
        .is('diets', null)
        .select('id');
      if (error) throw new Error(error.message);
      return (data ?? []).length > 0;
    },
  };
}

/**
 * Admin only. POST { after?, limit?, dry_run? } fills `recipe_cards.diets` on cards published
 * before PIN-83, one batch per call. Call again with `after: next_cursor` until it is null.
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
    console.error('[backfill-diets] admin check failed', adminError);
    return jsonResponse({ error: 'Could not verify admin' }, 500);
  }
  if (isAdmin !== true) return jsonResponse({ error: 'Admins only' }, 403);

  const after = body.after ?? null;
  if (after !== null && (typeof after !== 'string' || !UUID.test(after))) {
    return jsonResponse({ error: 'after must be a next_cursor value' }, 400);
  }

  const db = supabaseDietsDb(admin);
  const started = Date.now();
  try {
    if (body.dry_run === true) {
      return jsonResponse({ dry_run: true, pending: await db.countPending() });
    }

    const result = await runDietsBackfillBatch(db, (recipe) => deriveRecipeDiets(recipe), {
      after,
      limit: clampDietsBatchSize(body.limit),
    });

    await logUsageEvent(admin, {
      userId: user.id,
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

    return jsonResponse({
      scanned: result.scanned,
      updated: result.updated,
      still_null: result.stillNull,
      skipped: result.skipped,
      next_cursor: result.nextCursor,
      errors: result.errors.slice(0, 10),
    });
  } catch (error) {
    console.error('[backfill-diets] batch failed', error);
    return jsonResponse({ error: 'Backfill batch failed' }, 500);
  }
});
