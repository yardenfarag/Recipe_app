/**
 * The recipe columns save-recipe-edit writes, worked out from the request and the stored row (PIN-79, ADR 018).
 * No database or network calls; recipeEditStore.ts does those.
 */
import { sanitizeRecipeAppliances } from './enrich/appliances.ts';
import { classifyLlmRecipe } from '../extraction/classifyRecipe.ts';
import { imageRecalc, storedEditContent } from './recipeEditPlan.ts';
import {
  type Ingredient,
  type Instruction,
  type LockedField,
  PENDING_FIELDS,
  type PendingField,
  type RecalcField,
  type RecipeEditContent,
  type RecipeImportSource,
} from './recipeEditTypes.ts';
import { rowsMissingAmounts, withoutAmounts } from './recipeRecalc.ts';

type Row = Record<string, unknown>;

export const WRITTEN_COLUMNS: Row = { extraction_source: 'manual', original_url: null, platform: 'unknown' };

/** A finished import keeps where it came from, so duplicate-link checks and Hub rules still apply. */
export function importColumns(source: RecipeImportSource): Row {
  return {
    extraction_source: source.extraction_source,
    original_url: source.original_url,
    platform: source.platform,
    image_url: source.image_url,
    source_video_url: source.source_video_url,
  };
}

/** Columns an edit or write sets from the user's content. */
export function contentColumns(
  content: RecipeEditContent,
  lockedFields: LockedField[],
  pending: PendingField[],
  amountRows: number[],
): Row {
  const stored = storedEditContent(content);
  // Stale metric/spoons must not show while their recalculation runs (or waits for the cap).
  const staleRows = pending.includes('ingredient_amounts')
    ? [...new Set([...amountRows, ...rowsMissingAmounts(stored.ingredients)])]
    : [];
  const ingredients = withoutAmounts(stored.ingredients, staleRows);
  const classified = classifyLlmRecipe({ found_recipe: true, ...stored, ingredients });
  return {
    ...stored,
    ingredients,
    appliances: sanitizeRecipeAppliances(content.appliances, stored.instructions.map((step) => step.step)),
    extraction_status: classified.status === 'failed' ? 'full' : classified.status,
    missing_fields: classified.missingFields,
    locked_fields: lockedFields,
    // PIN-80: macros are a split of Pinch's calorie estimate. Once the user sets calories by hand
    // they would not match, and would never be updated, so they go until "reset to Pinch's estimate".
    ...(lockedFields.includes('calories') ? { nutrition: null } : {}),
    // A hand edit replaces kitchen auto-apply, as a remix does (RecipeView handleVariant).
    kitchen_original: null,
    kitchen_adapted_summary: null,
  };
}

/** The fields an edit, write or import leaves in recalc_pending, in PENDING_FIELDS order. */
export function pendingAfterSave(
  content: RecipeEditContent,
  lockedFields: LockedField[],
  recalculate: RecalcField[],
  existing: Row | null,
): PendingField[] {
  // Also recalculated, whatever Jev said:
  // - fields an earlier save left pending;
  // - fields the user just reset to Pinch's estimate (locked before, unlocked now);
  // - amounts for any row without grams/spoons (the editor drops them from changed rows).
  const locked = new Set<string>(lockedFields);
  const unlocked = asArray<RecalcField>(existing?.locked_fields).filter((field) => !locked.has(field));
  const amountsMissing = rowsMissingAmounts(storedEditContent(content).ingredients).length > 0;
  // - a picture the owner asked Pinch to draw (imageRecalc).
  const image = imageRecalc(content.photo.action);
  return orderedFields([
    ...recalculate,
    ...asArray<PendingField>(existing?.recalc_pending),
    ...unlocked,
    ...(amountsMissing ? (['ingredient_amounts'] as const) : []),
    ...(image.draw ? (['image'] as const) : []),
  ]).filter((field) => !locked.has(field) && !(field === 'image' && image.cancel));
}

/** What a retry re-runs: the row's pending fields, minus any the user has locked since. */
export function pendingForRetry(row: Row): PendingField[] {
  const locked = new Set(asArray<string>(row.locked_fields));
  return orderedFields(asArray<PendingField>(row.recalc_pending)).filter((field) => !locked.has(field));
}

/** The stored row as planRecipeEdit's `before`. */
export function beforeOf(row: Row) {
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

/** Same window the app uses to show "Updating…" (2 minutes). */
const FRESH_RUN_MS = 2 * 60 * 1000;

export function runIsFresh(startedAt: unknown, now = Date.now()): boolean {
  if (typeof startedAt !== 'string') return false;
  const age = now - Date.parse(startedAt);
  return Number.isFinite(age) && age >= 0 && age < FRESH_RUN_MS;
}

function orderedFields(fields: readonly PendingField[]): PendingField[] {
  const set = new Set(fields);
  return PENDING_FIELDS.filter((field) => set.has(field));
}
