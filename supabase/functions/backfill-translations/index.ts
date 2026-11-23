import { serve } from '../_shared/core/observe.ts';
import { type Db, toJson } from '../_shared/core/supabaseAdmin.ts';

import { corsHeaders, jsonResponse } from '../_shared/core/cors.ts';
import { createAuthedSupabase } from '../_shared/core/recipeLookup.ts';
import { createServiceSupabase } from '../_shared/core/supabaseAdmin.ts';
import { logUsageEvent } from '../_shared/core/usageLog.ts';
import {
  clampTranslationBatchSize,
  parseTranslationCursor,
  runTranslationBackfillBatch,
  type StaleTranslationRow,
  TRANSLATION_COST_PER_ROW_USD,
  type TranslationBackfillDb,
} from '../_shared/recipes/enrich/translationBackfill.ts';
import { parseIngredientAmount } from '../_shared/recipes/ingredientAmounts.ts';
import {
  isTranslateLanguageCode,
  recipeAlreadyInLanguage,
  TRANSLATION_VERSION,
  translateRecipeWithLlm,
} from '../_shared/recipes/translateRecipe.ts';

interface RequestBody {
  /** next_cursor from the previous response; omit to start. */
  after?: unknown;
  /** 1–10, default 10. */
  limit?: number;
  /** Only count the stale rows (by language) and estimate the cost; no model calls, no writes. */
  dry_run?: boolean;
}

type JoinedRow = {
  recipe_id: string;
  language_code: string;
  translation_version: number | null;
  recipes: { title: string; ingredients: unknown; instructions: unknown } | null;
};

const STALE = `translation_version.is.null,translation_version.lt.${TRANSLATION_VERSION}`;

function sourceFrom(recipe: JoinedRow['recipes']): StaleTranslationRow['source'] | null {
  if (!recipe?.title?.trim()) return null;
  const ingredients = (Array.isArray(recipe.ingredients) ? recipe.ingredients : [])
    .filter((i): i is Record<string, unknown> => Boolean(i) && typeof i === 'object')
    .filter((i) => typeof i.name === 'string' && i.name.trim() && Number.isFinite(Number(i.quantity)))
    .map((i) => {
      const metric = parseIngredientAmount(i.metric);
      const spoons = parseIngredientAmount(i.spoons);
      return {
        name: String(i.name).trim(),
        quantity: Number(i.quantity),
        unit: typeof i.unit === 'string' ? i.unit.trim() : '',
        ...(metric ? { metric } : {}),
        ...(spoons ? { spoons } : {}),
      };
    });
  const instructions = (Array.isArray(recipe.instructions) ? recipe.instructions : [])
    .filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === 'object')
    .filter((s) => Number.isInteger(s.step) && typeof s.text === 'string' && s.text.trim())
    .map((s) => ({
      step: Number(s.step),
      text: String(s.text).trim(),
      ...(Number.isFinite(s.timestamp_seconds) ? { timestamp_seconds: Math.max(0, Math.round(Number(s.timestamp_seconds))) } : {}),
    }));
  if (ingredients.length === 0 && instructions.length === 0) return null;
  return { title: recipe.title.trim(), ingredients, instructions };
}

function supabaseTranslationDb(admin: Db): TranslationBackfillDb {
  return {
    async fetchStale(after, limit) {
      const cursor = after
        ? `,or(recipe_id.gt.${after.recipeId},and(recipe_id.eq.${after.recipeId},language_code.gt.${after.languageCode}))`
        : '';
      // One `or` holding an `and`, so the stale test and the cursor both apply.
      const { data, error } = await admin
        .from('recipe_translations')
        .select('recipe_id, language_code, translation_version, recipes!inner(title, ingredients, instructions)')
        .or(`and(or(${STALE})${cursor})`)
        .order('recipe_id', { ascending: true })
        .order('language_code', { ascending: true })
        .limit(limit);
      if (error) throw new Error(error.message);
      const rows: StaleTranslationRow[] = [];
      for (const row of (data ?? []) as unknown as JoinedRow[]) {
        const source = sourceFrom(row.recipes);
        if (!source) continue;
        rows.push({
          recipeId: row.recipe_id,
          languageCode: row.language_code,
          translationVersion: row.translation_version,
          source,
        });
      }
      return rows;
    },
    async countStale() {
      const { data, error } = await admin.from('recipe_translations').select('language_code').or(STALE);
      if (error) throw new Error(error.message);
      const counts: Record<string, number> = {};
      for (const row of data ?? []) counts[row.language_code] = (counts[row.language_code] ?? 0) + 1;
      return counts;
    },
    async saveTranslation(row, content, version) {
      // A no-op when the app redid the row in the meantime.
      const { data, error } = await admin
        .from('recipe_translations')
        .update({
          title: content.title,
          ingredients: toJson(content.ingredients),
          instructions: toJson(content.instructions),
          translation_version: version,
        })
        .eq('recipe_id', row.recipeId)
        .eq('language_code', row.languageCode)
        .or(STALE)
        .select('recipe_id');
      if (error) throw new Error(error.message);
      return (data ?? []).length > 0;
    },
  };
}

/**
 * Admin only. POST { after?, limit?, dry_run? } translates again the cached translations made before
 * TRANSLATION_VERSION (PIN-53), one batch per call. Start with `dry_run: true` to see how many rows are stale and
 * what it should cost. Call again with `after: next_cursor` until it is null. Check the OpenRouter balance first.
 */
serve('backfill-translations', async (req) => {
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
    console.error('[backfill-translations] admin check failed', adminError);
    return jsonResponse({ error: 'Could not verify admin' }, 500);
  }
  if (isAdmin !== true) return jsonResponse({ error: 'Admins only' }, 403);

  const after = parseTranslationCursor(body.after);
  if (after === undefined) {
    return jsonResponse({ error: 'after must be a next_cursor value ({ recipe_id, language_code })' }, 400);
  }

  const db = supabaseTranslationDb(admin);
  const started = Date.now();
  try {
    if (body.dry_run === true) {
      const byLanguage = await db.countStale();
      const stale = Object.values(byLanguage).reduce((sum, n) => sum + n, 0);
      return jsonResponse({
        dry_run: true,
        version: TRANSLATION_VERSION,
        stale,
        by_language: byLanguage,
        estimated_cost_usd: Math.round(stale * TRANSLATION_COST_PER_ROW_USD * 100) / 100,
      });
    }

    const result = await runTranslationBackfillBatch(
      db,
      async (input) =>
        // Same shortcut as translate-recipe: text already in the target language is saved as is.
        recipeAlreadyInLanguage(input, input.targetLanguage)
          ? { title: input.title, ingredients: input.ingredients, instructions: input.instructions, usage: null }
          : await translateRecipeWithLlm(input),
      {
        after,
        limit: clampTranslationBatchSize(body.limit),
        version: TRANSLATION_VERSION,
        isLanguage: isTranslateLanguageCode,
      },
    );

    const nextCursor = result.nextCursor
      ? { recipe_id: result.nextCursor.recipeId, language_code: result.nextCursor.languageCode }
      : null;
    await logUsageEvent(admin, {
      userId: user.id,
      action: 'translation_backfill',
      status: result.errors.length > 0 ? 'partial' : 'ok',
      usages: result.usages,
      tokensCharged: 0,
      durationMs: Date.now() - started,
      metadata: {
        version: TRANSLATION_VERSION,
        scanned: result.scanned,
        updated: result.updated,
        failed: result.failed,
        skipped: result.skipped,
        next_cursor: nextCursor,
        errors: result.errors.slice(0, 10),
      },
    });

    return jsonResponse({
      version: TRANSLATION_VERSION,
      scanned: result.scanned,
      updated: result.updated,
      failed: result.failed,
      skipped: result.skipped,
      next_cursor: nextCursor,
      errors: result.errors.slice(0, 10),
    });
  } catch (error) {
    console.error('[backfill-translations] batch failed', error);
    return jsonResponse({ error: 'Backfill batch failed' }, 500);
  }
});
