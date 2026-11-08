/**
 * POST SaveRecipeEditRequest -> SaveRecipeEditResult (PIN-79, ADR 018). Contract:
 * src/lib/supabase/saveRecipeEdit.ts, mirrored in _shared/recipeEditTypes.ts.
 *
 *   edit   save a hand edit of the caller's recipe
 *   write  insert a written recipe (extraction_source 'manual', no URL)
 *   retry  re-run whatever is still in recalc_pending
 *
 * Signed-in only, free (never spends recipe credits). The decision of what to save, block or
 * recalculate is planRecipeEdit (_shared/recipeEditPlan.ts). This file loads, stores and logs.
 * The saved row is returned at once; recalculation runs after the response (recipeRecalc.ts),
 * capped at RECIPE_EDIT_DAILY_LIMIT saves a day. Never touches recipe_cards.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { sanitizeRecipeAppliances } from '../_shared/appliances.ts';
import { classifyGeminiRecipe } from '../_shared/classifyRecipe.ts';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { currentUtcDate, refundDailyAiUsage, reserveDailyAiUsage } from '../_shared/dailyAiUsage.ts';
import { persistUploadedPhoto } from '../_shared/persistThumbnail.ts';
import { RECIPE_EDIT_DAILY_LIMIT } from '../_shared/pricing.ts';
import { planRecipeEdit, type RecipeEditPlan, storedEditContent } from '../_shared/recipeEditPlan.ts';
import {
  type Ingredient,
  type Instruction,
  type LockedField,
  parseSaveRecipeEditRequest,
  RECALC_FIELDS,
  type RecalcField,
  type RecipeEditContent,
  type SaveRecipeEditResult,
} from '../_shared/recipeEditTypes.ts';
import { createAuthedSupabase } from '../_shared/recipeLookup.ts';
import { rowsMissingAmounts, runRecipeRecalculation, withoutAmounts } from '../_shared/recipeRecalc.ts';
import { createServiceSupabase } from '../_shared/supabaseAdmin.ts';
import { logUsageEvent } from '../_shared/usageLog.ts';

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

// A replaced photo is up to 2,000,000 base64 characters (MAX_PHOTO_BASE64_CHARS) plus the recipe.
const MAX_BODY_BYTES = 2_400_000;

type Row = Record<string, unknown>;
type Admin = SupabaseClient;

const respond = (body: SaveRecipeEditResult, status = 200) => jsonResponse(body, status);
const failed = (code: 'auth_required' | 'not_found' | 'server_error', message: string, status: number) =>
  respond({ status: 'failed', code, message }, status);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
  if (Number(req.headers.get('content-length')) > MAX_BODY_BYTES) {
    return failed('server_error', 'Request payload is too large.', 413);
  }

  const authHeader = req.headers.get('Authorization');
  const authed = authHeader ? createAuthedSupabase(authHeader) : null;
  const { data: { user } } = authed ? await authed.auth.getUser() : { data: { user: null } };
  if (!user) return failed('auth_required', 'Sign in to edit or write recipes.', 401);

  const admin = createServiceSupabase();
  if (!admin) return failed('server_error', 'Server is not configured.', 500);

  let raw: unknown;
  try {
    const text = await req.text();
    if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
      return failed('server_error', 'Request payload is too large.', 413);
    }
    raw = JSON.parse(text);
  } catch {
    return failed('server_error', 'Invalid JSON body.', 400);
  }
  const request = parseSaveRecipeEditRequest(raw);
  if (!request) return failed('server_error', 'Invalid save-recipe-edit request.', 400);

  const started = Date.now();
  try {
    if (request.mode === 'retry') return await retry(admin, user.id, request.recipe_id);

    const existing = request.mode === 'edit' ? await loadOwnRecipe(admin, user.id, request.recipe_id) : null;
    if (request.mode === 'edit' && !existing) return failed('not_found', 'Recipe not found.', 404);

    const plan = await planRecipeEdit({
      before: existing ? beforeOf(existing) : null,
      after: request.content,
      lockedFields: request.locked_fields,
      ...(request.mode === 'edit'
        ? { stepSources: request.step_sources, ingredientSources: request.ingredient_sources }
        : {}),
      appLanguage: request.app_language,
    });
    await logCheck(admin, user.id, request.mode, plan, existing, started);

    if (plan.outcome === 'invalid') return respond({ status: 'invalid', errors: plan.errors }, 422);
    if (plan.outcome === 'blocked') return respond({ status: 'blocked', reasons: plan.reasons });

    const imageUrl = await photoColumn(request.content, user.id);
    if (imageUrl === false) return failed('server_error', "Couldn't save the photo.", 500);

    // Fields an earlier save left pending are carried into this one.
    const locked = new Set<string>(request.locked_fields);
    const pending = orderedFields([
      ...plan.recalculate,
      ...asArray<RecalcField>(existing?.recalc_pending),
    ]).filter((field) => !locked.has(field));

    const reservation = pending.length ? await reserve(admin, user.id) : null;
    const startedAt = reservation?.ok ? new Date().toISOString() : null;
    const columns = contentColumns(request.content, request.locked_fields, pending, plan.amountRows);
    const recalc = { recalc_pending: pending, recalc_started_at: startedAt };

    const saved = request.mode === 'edit'
      ? await updateRecipe(admin, user.id, request.recipe_id, { ...columns, ...recalc, ...imageUrl }, {
        clearTranslations: true,
      })
      : await insertRecipe(admin, user.id, { ...columns, ...recalc, ...imageUrl, source_language: plan.sourceLanguage });
    if (!saved) {
      if (reservation?.ok) await refundDailyAiUsage(admin, user.id, 'recipe_edit', reservation.date);
      return failed('server_error', "Couldn't save the recipe.", 500);
    }

    return startRecalculation(admin, user.id, saved, pending, startedAt, reservation, request.mode);
  } catch (err) {
    console.error('[save-recipe-edit] error', err);
    return failed('server_error', "Couldn't save the recipe.", 500);
  }
});

// --- Modes ------------------------------------------------------------------------------------

async function retry(admin: Admin, userId: string, recipeId: string): Promise<Response> {
  const row = await loadOwnRecipe(admin, userId, recipeId);
  if (!row) return failed('not_found', 'Recipe not found.', 404);
  const locked = new Set(asArray<string>(row.locked_fields));
  const pending = orderedFields(asArray<RecalcField>(row.recalc_pending)).filter((field) => !locked.has(field));
  if (!pending.length) return respond({ status: 'saved', recipe: row, recalculating: [], recalculation: 'none' });

  const reservation = await reserve(admin, userId);
  const startedAt = reservation.ok ? new Date().toISOString() : null;
  const saved = await updateRecipe(admin, userId, recipeId, { recalc_pending: pending, recalc_started_at: startedAt });
  if (!saved) {
    if (reservation.ok) await refundDailyAiUsage(admin, userId, 'recipe_edit', reservation.date);
    return failed('server_error', "Couldn't start the update.", 500);
  }
  return startRecalculation(admin, userId, saved, pending, startedAt, reservation, 'retry');
}

function startRecalculation(
  admin: Admin,
  userId: string,
  saved: Row,
  pending: RecalcField[],
  startedAt: string | null,
  reservation: { ok: boolean } | null,
  mode: 'edit' | 'write' | 'retry',
): Response {
  if (!pending.length) return respond({ status: 'saved', recipe: saved, recalculating: [], recalculation: 'none' });
  // Past the cap: the content is saved and the fields stay pending for tomorrow's retry.
  if (!reservation?.ok || !startedAt) {
    return respond({ status: 'saved', recipe: saved, recalculating: [], recalculation: 'limited' });
  }
  const run = runRecipeRecalculation({ admin, userId, recipe: saved, fields: pending, startedAt, mode }).catch((err) =>
    console.error('[save-recipe-edit] recalculation failed', err)
  );
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(run);
  return respond({ status: 'saved', recipe: saved, recalculating: pending, recalculation: 'started' });
}

// --- Storage ----------------------------------------------------------------------------------

async function loadOwnRecipe(admin: Admin, userId: string, recipeId: string): Promise<Row | null> {
  // The service role bypasses RLS, so ownership is checked here.
  const { data, error } = await admin.from('recipes').select('*').eq('id', recipeId).maybeSingle();
  if (error) throw error;
  return data && data.user_id === userId ? data : null;
}

async function updateRecipe(
  admin: Admin,
  userId: string,
  recipeId: string,
  columns: Row,
  options: { clearTranslations?: boolean } = {},
): Promise<Row | null> {
  const { data, error } = await admin
    .from('recipes')
    .update(columns)
    .eq('id', recipeId)
    .eq('user_id', userId)
    .select('*')
    .maybeSingle();
  if (error) console.error('[save-recipe-edit] update failed', error);
  if (!data) return null;
  if (options.clearTranslations) {
    // Translations are of the old text; they rebuild when the recipe is opened in another language.
    const { error: translationsError } = await admin.from('recipe_translations').delete().eq('recipe_id', recipeId);
    if (translationsError) console.error('[save-recipe-edit] clearing translations failed', translationsError);
  }
  return data;
}

async function insertRecipe(admin: Admin, userId: string, columns: Row): Promise<Row | null> {
  const { data, error } = await admin
    .from('recipes')
    .insert({
      ...columns,
      user_id: userId,
      extraction_source: 'manual',
      original_url: null,
      platform: 'unknown',
      extraction_status: 'full',
    })
    .select('*')
    .single();
  if (error) console.error('[save-recipe-edit] insert failed', error);
  return data ?? null;
}

/** Columns an edit or write sets from the user's content. */
function contentColumns(
  content: RecipeEditContent,
  lockedFields: LockedField[],
  pending: RecalcField[],
  amountRows: number[],
): Row {
  const stored = storedEditContent(content);
  // Stale metric/spoons must not show while their recalculation runs (or waits for the cap).
  const staleRows = pending.includes('ingredient_amounts')
    ? [...new Set([...amountRows, ...rowsMissingAmounts(stored.ingredients)])]
    : [];
  const ingredients = withoutAmounts(stored.ingredients, staleRows);
  const classified = classifyGeminiRecipe({ found_recipe: true, ...stored, ingredients });
  return {
    ...stored,
    ingredients,
    appliances: sanitizeRecipeAppliances(content.appliances, stored.instructions.map((step) => step.step)),
    extraction_status: classified.status === 'failed' ? 'full' : classified.status,
    missing_fields: classified.missingFields,
    locked_fields: lockedFields,
    // A hand edit replaces kitchen auto-apply, as a remix does (RecipeView handleVariant).
    kitchen_original: null,
    kitchen_adapted_summary: null,
  };
}

/** `{}` keeps the photo, `{ image_url }` sets or clears it, false = the upload failed. */
async function photoColumn(content: RecipeEditContent, userId: string): Promise<Row | false> {
  const photo = content.photo;
  if (photo.action === 'keep') return {};
  if (photo.action === 'remove') return { image_url: null };
  const url = await persistUploadedPhoto({ imageBase64: photo.base64, mimeType: photo.mime_type, userId });
  return url ? { image_url: url } : false;
}

async function reserve(admin: Admin, userId: string): Promise<{ ok: boolean; date: string }> {
  const date = currentUtcDate();
  const reserved = await reserveDailyAiUsage(admin, userId, 'recipe_edit', RECIPE_EDIT_DAILY_LIMIT, date);
  // An RPC error is treated like the cap: the save still goes through and the fields stay pending.
  return { ok: reserved === 'ok', date };
}

// --- Helpers ----------------------------------------------------------------------------------

function beforeOf(row: Row) {
  return {
    title: String(row.title ?? ''),
    servings: Number(row.servings) || 1,
    ingredients: asArray<Ingredient>(row.ingredients),
    instructions: asArray<Instruction>(row.instructions),
    tags: asArray<string>(row.tags),
    cook_note: typeof row.cook_note === 'string' ? row.cook_note : null,
  };
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function orderedFields(fields: RecalcField[]): RecalcField[] {
  const set = new Set(fields);
  return RECALC_FIELDS.filter((field) => set.has(field));
}

/** Every Jev call is logged; blocked saves and saves that went through on a Jev failure always are. */
async function logCheck(
  admin: Admin,
  userId: string,
  mode: 'edit' | 'write',
  plan: RecipeEditPlan,
  existing: Row | null,
  started: number,
): Promise<void> {
  if (plan.outcome === 'invalid') return;
  const jevFailed = plan.outcome === 'save' && plan.jevFailed;
  if (!plan.jev && !jevFailed) return;
  await logUsageEvent(admin, {
    userId,
    action: 'recipe_edit_check',
    platform: typeof existing?.platform === 'string' ? existing.platform : 'unknown',
    status: plan.outcome === 'blocked' ? 'blocked' : jevFailed ? 'jev_failed' : 'ok',
    ...(plan.jev
      ? { pricedCall: { model: plan.jev.model, costUsd: plan.jev.costUsd, promptTokens: plan.jev.inputTokens } }
      : {}),
    tokensCharged: 0,
    durationMs: Date.now() - started,
    errorMessage: plan.outcome === 'save' ? plan.jevError ?? null : null,
    metadata: {
      mode,
      recipe_id: existing?.id ?? null,
      ...(plan.outcome === 'blocked' ? { reasons: plan.reasons } : {}),
      ...(plan.outcome === 'save' ? { recalculate: plan.recalculate, scores: plan.scores } : {}),
      ...(plan.jev ? { jev_ms: plan.jev.ms } : {}),
    },
  });
}
