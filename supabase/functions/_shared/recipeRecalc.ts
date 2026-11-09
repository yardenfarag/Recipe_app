/**
 * Background recalculation after a hand edit or a written recipe (PIN-79, ADR 018). save-recipe-edit
 * saves the content, sets `recalc_pending` and `recalc_started_at`, answers the app, and then runs
 * this under EdgeRuntime.waitUntil.
 *
 * - Two model calls run in parallel: recipe_estimates (calories, time, effort, cost, tags,
 *   metric/spoons) and appliances. Each result is written as soon as it arrives and its fields are
 *   removed from `recalc_pending`. Writes go through one queue, so two results never read and
 *   rewrite the row at the same time.
 * - Before each write the row is read again. If `recalc_started_at` is no longer this run's (the
 *   user saved again, or a retry started), the result is dropped. The update is also conditional
 *   on that timestamp, so a save landing between the read and the write still wins.
 * - A field locked by then is never written. A field whose task failed stays in `recalc_pending`
 *   for a retry.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { classifyGeminiRecipe } from './classifyRecipe.ts';
import type { GeminiUsageSnapshot } from './pricing.ts';
import { appliancesForRecipe } from './recipeAppliances.ts';
import type { Ingredient, Instruction, RecalcField } from './recipeEditTypes.ts';
import { type EstimateField, estimateRecipeFields } from './recipeEstimates.ts';
import { logUsageEvent } from './usageLog.ts';

type Row = Record<string, unknown>;

/** Rows with a measurable amount but no metric or spoons: the ones `ingredient_amounts` fills. */
export function rowsMissingAmounts(ingredients: Ingredient[]): number[] {
  return ingredients.flatMap((item, row) => (item.quantity > 0 && (!item.metric || !item.spoons) ? [row] : []));
}

/** Drops metric/spoons from rows whose amounts are being recalculated, so stale ones never show. */
export function withoutAmounts(ingredients: Ingredient[], rows: number[]): Ingredient[] {
  const set = new Set(rows);
  return ingredients.map((item, row) => {
    if (!set.has(row)) return item;
    const { metric: _metric, spoons: _spoons, ...rest } = item;
    return rest;
  });
}

function sameInstant(a: unknown, b: string): boolean {
  return typeof a === 'string' && Date.parse(a) === Date.parse(b);
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export async function runRecipeRecalculation(opts: {
  admin: SupabaseClient;
  userId: string;
  /** The row as saved, with this run's recalc_started_at. */
  recipe: Row;
  fields: RecalcField[];
  startedAt: string;
  mode: 'edit' | 'write' | 'import' | 'retry';
}): Promise<void> {
  const { admin, userId, recipe, fields, startedAt } = opts;
  const recipeId = String(recipe.id);
  const started = Date.now();
  const usages: GeminiUsageSnapshot[] = [];
  const written: RecalcField[] = [];
  const failed: RecalcField[] = [];
  const metadata: Record<string, unknown> = {};
  let stale = false;
  let queue: Promise<void> = Promise.resolve();

  /** Queues one result. `patch` gets the fresh row and the fields still writable. */
  const write = (done: RecalcField[], patch: (row: Row, writable: Set<RecalcField>) => Row) => {
    queue = queue.then(async () => {
      if (stale) return;
      const { data: row, error } = await admin.from('recipes').select('*').eq('id', recipeId).maybeSingle();
      if (error || !row) {
        failed.push(...done);
        return;
      }
      if (!sameInstant(row.recalc_started_at, startedAt)) {
        stale = true;
        return;
      }
      const locked = new Set(asArray<string>(row.locked_fields));
      const writable = new Set(done.filter((field) => !locked.has(field)));
      const update = patch(row, writable);
      // A field that became locked is dropped from pending too: the user's value stands.
      update.recalc_pending = asArray<RecalcField>(row.recalc_pending).filter((field) => !done.includes(field));
      const merged = { ...row, ...update };
      update.missing_fields = classifyGeminiRecipe({
        found_recipe: true,
        title: merged.title as string,
        ingredients: asArray(merged.ingredients),
        instructions: asArray(merged.instructions),
        calories: merged.calories as number | null,
        estimated_time_minutes: merged.estimated_time_minutes as number | null,
        cost_estimate: merged.cost_estimate as string | null,
        effort_level: merged.effort_level as string | null,
      }).missingFields;
      const { data: updated, error: updateError } = await admin
        .from('recipes')
        .update(update)
        .eq('id', recipeId)
        .eq('recalc_started_at', row.recalc_started_at as string)
        .select('id');
      if (updateError) {
        console.error('[recipeRecalc] write failed', { recipeId, done, updateError });
        failed.push(...done);
      } else if (!updated?.length) {
        stale = true;
      } else {
        written.push(...writable);
      }
    });
    return queue;
  };

  const ingredients = asArray<Ingredient>(recipe.ingredients);
  const instructions = asArray<Instruction>(recipe.instructions);
  const tasks: Promise<unknown>[] = [];

  const estimateFields = fields.filter((field): field is EstimateField => field !== 'appliances');
  if (estimateFields.length) {
    const amountRows = rowsMissingAmounts(ingredients);
    tasks.push(
      estimateRecipeFields({
        title: String(recipe.title ?? ''),
        servings: Number(recipe.servings) || 1,
        ingredients,
        instructions,
        fields: estimateFields,
        amountRows,
      })
        .then(({ values, usage }) => {
          if (usage) usages.push(usage);
          const done = estimateFields.filter((field) => values[field] !== undefined);
          failed.push(...estimateFields.filter((field) => values[field] === undefined));
          if (!done.length) return;
          return write(done, (row, writable) => {
            const update: Row = {};
            if (writable.has('calories') && values.calories) {
              update.calories = values.calories.calories;
              update.calories_reasoning = values.calories.reasoning;
            }
            if (writable.has('estimated_time_minutes') && values.estimated_time_minutes) {
              update.estimated_time_minutes = values.estimated_time_minutes.minutes;
              update.time_reasoning = values.estimated_time_minutes.reasoning;
            }
            if (writable.has('effort_level')) update.effort_level = values.effort_level;
            if (writable.has('cost_estimate')) update.cost_estimate = values.cost_estimate;
            if (writable.has('tags')) update.tags = values.tags;
            if (writable.has('ingredient_amounts') && values.ingredient_amounts?.size) {
              // Only rows that still read as they did when estimated.
              update.ingredients = asArray<Ingredient>(row.ingredients).map((item, index) => {
                const amounts = values.ingredient_amounts!.get(index);
                const source = ingredients[index];
                if (!amounts || !source || item.name !== source.name || item.quantity !== source.quantity || item.unit !== source.unit) {
                  return item;
                }
                const { metric: _m, spoons: _s, ...rest } = item;
                return { ...rest, ...amounts };
              });
            }
            return update;
          });
        })
        .catch((err) => {
          console.error('[recipeRecalc] estimates failed', { recipeId, err });
          metadata.estimates_error = err instanceof Error ? err.message.slice(0, 300) : String(err);
          failed.push(...estimateFields);
        }),
    );
  }

  if (fields.includes('appliances')) {
    tasks.push(
      appliancesForRecipe({ title: recipe.title, ingredients, instructions }, usages)
        .then(({ appliances, metadata: applianceMetadata }) => {
          Object.assign(metadata, applianceMetadata);
          // null = the task failed (it never throws). Leave the field pending.
          if (appliances === null) {
            failed.push('appliances');
            return;
          }
          return write(['appliances'], (_row, writable) => (writable.has('appliances') ? { appliances } : {}));
        }),
    );
  }

  await Promise.all(tasks);
  await queue;

  await logUsageEvent(admin, {
    userId,
    action: 'recipe_edit_recalc',
    platform: typeof recipe.platform === 'string' ? recipe.platform : null,
    status: stale ? 'stale' : failed.length === 0 ? 'ok' : written.length ? 'partial' : 'failed',
    usages,
    tokensCharged: 0,
    durationMs: Date.now() - started,
    metadata: { ...metadata, recipe_id: recipeId, mode: opts.mode, fields, written, failed },
  });
}
