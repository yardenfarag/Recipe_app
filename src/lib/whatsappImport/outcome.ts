import type { ImportItemResult } from '@shared/lib/whatsappImport';
import {
  extractionOutcomeIsUncertain,
  type ExtractedRecipe,
  type ExtractResult,
} from '@shared/lib/supabase/extractRecipe';

/**
 * What a WhatsApp import does with one `extract-recipe` answer: save the recipe, or stop with a result for the list.
 *
 * `acknowledge`: forget the import's request id, because the outcome is known. Snap does the same
 * (`applyExtractResult` in `src/app/(tabs)/add.tsx`): kept only while the charge is uncertain, so a retry reuses it
 * and is never charged twice.
 */
export type ExtractOutcome =
  | { action: 'save'; recipe: ExtractedRecipe }
  | { action: 'done'; result: ImportItemResult; acknowledge: boolean; dailyLimit?: true };

/** Out of credits, in each of the ways the server says it. */
const OUT_OF_CREDITS_CODES = new Set([
  'insufficient_credits',
  'monthly_limit',
  'subscription_required',
  'insufficient_tokens',
]);

export function classifyExtractResult(result: ExtractResult): ExtractOutcome {
  const acknowledge = Boolean(result.request_id) && !extractionOutcomeIsUncertain(result.code);

  if (result.code && OUT_OF_CREDITS_CODES.has(result.code)) {
    return { action: 'done', result: { status: 'out_of_credits' }, acknowledge };
  }

  // The day's food-check limit (shared with Snap): every later item would fail too, so the batch stops like it does
  // for credits, and the screen says why.
  if (result.code === 'daily_limit') {
    return { action: 'done', result: { status: 'out_of_credits' }, acknowledge, dailyLimit: true };
  }

  // The link is already in the Library: no import ran and nothing was charged.
  if (result.cached) {
    const recipeId =
      result.recipe && 'id' in result.recipe && typeof result.recipe.id === 'string' ? result.recipe.id : undefined;
    return {
      action: 'done',
      result: recipeId ? { status: 'already_saved', recipeId } : { status: 'already_saved' },
      acknowledge,
    };
  }

  if (result.status === 'failed' || result.status === 'coming_soon' || !result.recipe) {
    return {
      action: 'done',
      result: { status: 'failed', code: result.code ?? (result.status === 'coming_soon' ? 'coming_soon' : 'not_found') },
      acknowledge,
    };
  }

  // ADR 019: a partial import isn't saved, and it costs nothing. Snap opens the editor for it; a batch can't, so it's
  // listed as couldn't-import and the cook can Snap it on its own.
  if (result.status === 'partial') {
    return { action: 'done', result: { status: 'failed', code: 'partial' }, acknowledge };
  }

  return { action: 'save', recipe: result.recipe };
}
