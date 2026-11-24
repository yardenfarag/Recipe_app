/**
 * What save-recipe-edit reads and writes (PIN-79, ADR 018): the caller's recipe row, the uploaded photo, the daily
 * recipe_edit cap and the Jev check's usage row. Uses the service client, so ownership is checked here.
 */
import { currentUtcDate, reserveDailyAiUsage } from '../core/dailyAiUsage.ts';
import { type Db, type TablesInsert, untypedUpdate } from '../core/supabaseAdmin.ts';
import { logUsageEvent } from '../core/usageLog.ts';
import { persistUploadedPhoto } from '../extraction/persistThumbnail.ts';
import { RECIPE_EDIT_DAILY_LIMIT } from '../llm/pricing.ts';
import type { RecipeEditPlan } from './recipeEditPlan.ts';
import type { RecipeEditContent } from './recipeEditTypes.ts';

type Row = Record<string, unknown>;

export async function loadOwnRecipe(admin: Db, userId: string, recipeId: string): Promise<Row | null> {
  // The service role bypasses RLS, so ownership is checked here.
  const { data, error } = await admin.from('recipes').select('*').eq('id', recipeId).maybeSingle();
  if (error) throw error;
  return data && data.user_id === userId ? data : null;
}

export async function updateRecipe(
  admin: Db,
  userId: string,
  recipeId: string,
  columns: Row,
  options: { clearTranslations?: boolean } = {},
): Promise<Row | null> {
  const { data, error } = await admin
    .from('recipes')
    .update(untypedUpdate<'recipes'>(columns))
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

export async function insertRecipe(admin: Db, userId: string, columns: Row): Promise<Row | null> {
  const { data, error } = await admin
    .from('recipes')
    .insert({ ...untypedUpdate<'recipes'>(columns), user_id: userId, extraction_status: 'full' } as TablesInsert<'recipes'>)
    .select('*')
    .single();
  if (error) console.error('[save-recipe-edit] insert failed', error);
  return data ?? null;
}

/**
 * `{}` keeps the photo, `{ image_url }` sets or clears it, false = the upload failed. `generate` clears it too:
 * the page shows the loader in its place until the drawing is written (recipeRecalc.ts only fills an empty one).
 */
export async function photoColumn(
  content: RecipeEditContent,
  userId: string,
  persist = persistUploadedPhoto,
): Promise<Row | false> {
  const photo = content.photo;
  if (photo.action === 'keep') return {};
  if (photo.action === 'remove' || photo.action === 'generate') return { image_url: null, image_generated: false };
  const url = await persist({ imageBase64: photo.base64, mimeType: photo.mime_type, userId });
  return url ? { image_url: url, image_generated: false } : false;
}

/** One of today's RECIPE_EDIT_DAILY_LIMIT recalculations. */
export async function reserveRecipeEdit(admin: Db, userId: string): Promise<{ ok: boolean; date: string }> {
  const date = currentUtcDate();
  const reserved = await reserveDailyAiUsage(admin, userId, 'recipe_edit', RECIPE_EDIT_DAILY_LIMIT, date);
  // An RPC error is treated like the cap: the save still goes through and the fields stay pending.
  return { ok: reserved === 'ok', date };
}

/** Every Jev call is logged; blocked saves and saves that went through on a Jev failure always are. */
export async function logRecipeEditCheck(
  admin: Db,
  userId: string,
  mode: 'edit' | 'write' | 'import',
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
