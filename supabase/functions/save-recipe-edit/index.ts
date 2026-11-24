/**
 * POST SaveRecipeEditRequest -> SaveRecipeEditResult (PIN-79, ADR 018). Contract:
 * src/lib/supabase/saveRecipeEdit.ts, mirrored in _shared/recipes/recipeEditTypes.ts.
 *
 *   edit   save a hand edit of the caller's recipe
 *   write  insert a written recipe (extraction_source 'manual', no URL)
 *   import insert a partial import the user finished by hand (ADR 019), keeping its source
 *   retry  re-run whatever is still in recalc_pending
 *
 * Signed-in only, free (never spends recipe credits). What to save, block or recalculate is planRecipeEdit
 * (recipeEditPlan.ts); the columns come from recipeEditRows.ts; recipeEditStore.ts loads, stores and logs.
 * The saved row is returned at once; recalculation runs after the response (recipeRecalc.ts), capped at
 * RECIPE_EDIT_DAILY_LIMIT saves a day. Past the cap the save still goes through, so no withDailyAiUsage here.
 * Never touches recipe_cards.
 */
import { refundDailyAiUsage } from '../_shared/core/dailyAiUsage.ts';
import { handler, HttpError } from '../_shared/core/handler.ts';
import type { Db } from '../_shared/core/supabaseAdmin.ts';
import { planRecipeEdit } from '../_shared/recipes/recipeEditPlan.ts';
import {
  beforeOf,
  contentColumns,
  importColumns,
  pendingAfterSave,
  pendingForRetry,
  runIsFresh,
  WRITTEN_COLUMNS,
} from '../_shared/recipes/recipeEditRows.ts';
import {
  insertRecipe,
  loadOwnRecipe,
  logRecipeEditCheck,
  photoColumn,
  reserveRecipeEdit,
  updateRecipe,
} from '../_shared/recipes/recipeEditStore.ts';
import {
  parseSaveRecipeEditRequest,
  type PendingField,
  type SaveRecipeEditRequest,
  type SaveRecipeEditResult,
} from '../_shared/recipes/recipeEditTypes.ts';
import { runRecipeRecalculation } from '../_shared/recipes/recipeRecalc.ts';

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

// A replaced photo is up to 2,000,000 base64 characters (MAX_PHOTO_BASE64_CHARS) plus the recipe.
const MAX_BODY_BYTES = 2_400_000;

type Row = Record<string, unknown>;

const failed = (code: 'auth_required' | 'not_found' | 'server_error', message: string, status: number) =>
  new HttpError(status, code, message);
const signIn = failed('auth_required', 'Sign in to edit or write recipes.', 401);
const notFound = failed('not_found', 'Recipe not found.', 404);
const saveFailed = failed('server_error', "Couldn't save the recipe.", 500);

function parseRequest(raw: unknown): SaveRecipeEditRequest {
  const request = parseSaveRecipeEditRequest(raw);
  if (!request) throw failed('server_error', 'Invalid save-recipe-edit request.', 400);
  return request;
}

handler(
  {
    name: 'save-recipe-edit',
    auth: 'user',
    maxBodyBytes: MAX_BODY_BYTES,
    errors: {
      methodNotAllowed: HttpError.legacy(405, 'Method not allowed'),
      tooLarge: failed('server_error', 'Request payload is too large.', 413),
      authMissing: signIn,
      authInvalid: signIn,
      misconfigured: failed('server_error', 'Server is not configured.', 500),
      invalidJson: failed('server_error', 'Invalid JSON body.', 400),
    },
    input: parseRequest,
  },
  async ({ input: request, user, admin }): Promise<SaveRecipeEditResult> => {
    const started = Date.now();
    try {
      if (request.mode === 'retry') return await retry(admin, user.id, request.recipe_id);

      const existing = request.mode === 'edit' ? await loadOwnRecipe(admin, user.id, request.recipe_id) : null;
      if (request.mode === 'edit' && !existing) throw notFound;

      const plan = await planRecipeEdit({
        before: existing ? beforeOf(existing) : null,
        after: request.content,
        lockedFields: request.locked_fields,
        ...(request.mode === 'edit'
          ? { stepSources: request.step_sources, ingredientSources: request.ingredient_sources }
          : {}),
        appLanguage: request.app_language,
      });
      await logRecipeEditCheck(admin, user.id, request.mode, plan, existing, started);

      if (plan.outcome === 'invalid') throw HttpError.withBody(422, { status: 'invalid', errors: plan.errors });
      if (plan.outcome === 'blocked') return { status: 'blocked', reasons: plan.reasons };

      const imageUrl = await photoColumn(request.content, user.id);
      if (imageUrl === false) throw failed('server_error', "Couldn't save the photo.", 500);

      const pending = pendingAfterSave(request.content, request.locked_fields, plan.recalculate, existing);
      const reservation = pending.length ? await reserveRecipeEdit(admin, user.id) : null;
      const startedAt = reservation?.ok ? new Date().toISOString() : null;
      const columns = contentColumns(request.content, request.locked_fields, pending, plan.amountRows);
      const recalc = { recalc_pending: pending, recalc_started_at: startedAt };

      const saved = request.mode === 'edit'
        ? await updateRecipe(admin, user.id, request.recipe_id, { ...columns, ...recalc, ...imageUrl }, {
          clearTranslations: true,
        })
        : await insertRecipe(admin, user.id, {
          ...columns,
          ...recalc,
          ...(request.mode === 'import' ? importColumns(request.source) : WRITTEN_COLUMNS),
          ...imageUrl,
          source_language: (request.mode === 'import' ? request.source.source_language : null) ?? plan.sourceLanguage,
        });
      if (!saved) {
        if (reservation?.ok) await refundDailyAiUsage(admin, user.id, 'recipe_edit', reservation.date);
        throw saveFailed;
      }

      return startRecalculation(admin, user.id, saved, pending, startedAt, reservation, request.mode);
    } catch (err) {
      if (err instanceof HttpError) throw err;
      console.error('[save-recipe-edit] error', err);
      throw saveFailed;
    }
  },
);

async function retry(admin: Db, userId: string, recipeId: string): Promise<SaveRecipeEditResult> {
  const row = await loadOwnRecipe(admin, userId, recipeId);
  if (!row) throw notFound;
  const pending = pendingForRetry(row);
  if (!pending.length) return { status: 'saved', recipe: row, recalculating: [], recalculation: 'none' };
  // A run that is still going isn't restarted: that would spend a second unit of the daily cap
  // and make the running results stale (two devices, or a quick reopen).
  if (runIsFresh(row.recalc_started_at)) {
    return { status: 'saved', recipe: row, recalculating: pending, recalculation: 'started' };
  }

  const reservation = await reserveRecipeEdit(admin, userId);
  const startedAt = reservation.ok ? new Date().toISOString() : null;
  const saved = await updateRecipe(admin, userId, recipeId, { recalc_pending: pending, recalc_started_at: startedAt });
  if (!saved) {
    if (reservation.ok) await refundDailyAiUsage(admin, userId, 'recipe_edit', reservation.date);
    throw failed('server_error', "Couldn't start the update.", 500);
  }
  return startRecalculation(admin, userId, saved, pending, startedAt, reservation, 'retry');
}

function startRecalculation(
  admin: Db,
  userId: string,
  saved: Row,
  pending: PendingField[],
  startedAt: string | null,
  reservation: { ok: boolean } | null,
  mode: 'edit' | 'write' | 'import' | 'retry',
): SaveRecipeEditResult {
  if (!pending.length) return { status: 'saved', recipe: saved, recalculating: [], recalculation: 'none' };
  // Past the cap: the content is saved and the fields stay pending for tomorrow's retry.
  if (!reservation?.ok || !startedAt) {
    return { status: 'saved', recipe: saved, recalculating: [], recalculation: 'limited' };
  }
  const run = runRecipeRecalculation({ admin, userId, recipe: saved, fields: pending, startedAt, mode }).catch((err) =>
    console.error('[save-recipe-edit] recalculation failed', err)
  );
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(run);
  return { status: 'saved', recipe: saved, recalculating: pending, recalculation: 'started' };
}
