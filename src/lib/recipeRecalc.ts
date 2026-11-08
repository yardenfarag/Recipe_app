import { RECALC_FIELDS, type RecalcField, type Recipe } from '@/types/recipe';

/**
 * How long a background recalculation counts as running (ADR 018). Past this, fields still in
 * recalc_pending are treated as a failed run: the current values show and the app retries once.
 */
export const RECALC_UPDATING_MS = 2 * 60 * 1000;

/** How often the detail screen re-reads the row while a field is updating. */
export const RECALC_POLL_MS = 3000;

export type RecipeRecalcState =
  /** Nothing pending. */
  | { kind: 'idle' }
  /** A recalculation is running: show "Updating…" on these fields and poll. */
  | { kind: 'updating'; fields: RecalcField[]; remainingMs: number }
  /** Pending fields left by a failed or capped run: show current values, retry once on open. */
  | { kind: 'stale'; fields: RecalcField[] };

type RecalcRow = Pick<Recipe, 'recalc_pending' | 'recalc_started_at'>;

/**
 * Reads a recipe row's recalculation columns at time `now` (ms since epoch).
 *
 * `seenSince` is when this device first saw the current run (same recalc_started_at). The run began
 * no later than that, so a server clock ahead of the device's can't keep "Updating…" up for longer
 * than two minutes from then.
 */
export function recipeRecalcState(
  recipe: RecalcRow | null | undefined,
  now: number,
  seenSince?: number,
): RecipeRecalcState {
  const known = new Set<string>(RECALC_FIELDS);
  const fields = [...new Set(recipe?.recalc_pending ?? [])].filter((field): field is RecalcField =>
    known.has(field),
  );
  if (fields.length === 0) return { kind: 'idle' };

  const startedAt = recipe?.recalc_started_at ? Date.parse(recipe.recalc_started_at) : NaN;
  if (Number.isNaN(startedAt)) return { kind: 'stale', fields };

  // A start time ahead of this device's clock counts as just started, never as longer.
  const elapsed = Math.max(0, now - startedAt, seenSince != null ? now - seenSince : 0);
  if (elapsed >= RECALC_UPDATING_MS) return { kind: 'stale', fields };
  return { kind: 'updating', fields, remainingMs: RECALC_UPDATING_MS - elapsed };
}

/** The fields to show as "Updating…" right now. */
export function recalcUpdatingFields(state: RecipeRecalcState): RecalcField[] {
  return state.kind === 'updating' ? state.fields : [];
}
