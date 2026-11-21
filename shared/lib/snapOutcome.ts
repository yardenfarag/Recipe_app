import type { ExtractedRecipe, Recipe } from '../types/recipe';
import { isFoodGateReject, shouldOfferInvent } from './contentGate';
import { recipeIsInvented } from './recipeOrigin';
import { extractionOutcomeIsUncertain, NO_RESPONSE_CODE, type ExtractResult } from './supabase/extractRecipe';

/**
 * What Snap does with an import result (extract-recipe or invent-recipe), in the order the mobile app checks it
 * (src/app/(tabs)/add.tsx, `applyExtractResult`). Messages are translation keys, or the server's own text when it
 * sent one.
 */
export type SnapOutcome =
  /** Out of credits: say so and point to buying more. */
  | { kind: 'credits' }
  /** The session is gone: sign in again. */
  | { kind: 'auth' }
  /** A guest used up their free imports (mobile only). */
  | { kind: 'guest_limit' }
  | { kind: 'message'; tone: 'error' | 'info'; messageKey: SnapMessageKey; serverMessage?: string }
  /** No written recipe, but a dish: offer Guess the recipe (and Extract anyway when it may be a recipe). */
  | { kind: 'offer_invent'; dishGuess?: string; allowExtract: boolean }
  /** Already in the library: open the saved one. No import ran. */
  | { kind: 'saved'; recipe: Recipe }
  /** Ingredients or steps missing (ADR 019): free, never previewed or saved as is. */
  | { kind: 'partial'; recipe: ExtractedRecipe; missingIngredients: boolean }
  /** A whole recipe, to preview and save. */
  | { kind: 'preview'; recipe: ExtractedRecipe };

export type SnapMessageKey =
  | 'snap.videoTooLong'
  | 'snap.invalidUrl'
  | 'snap.gateFailed'
  | 'snap.gateDailyLimit'
  | 'snap.notFood'
  | 'snap.notFoodLink'
  | 'snap.comingSoon'
  | 'snap.notFound'
  | 'snap.genericError';

/**
 * Sorts a result into one outcome. `canOfferInvent` is false for a Guess the recipe run, which has nothing to
 * hand off to.
 */
export function snapOutcome(result: ExtractResult, canOfferInvent: boolean): SnapOutcome {
  const code = result.code;
  if (code === 'insufficient_credits' || code === 'subscription_required' || code === 'insufficient_tokens') {
    return { kind: 'credits' };
  }
  if (code === 'auth_required' || code === 'guest_id_required') return { kind: 'auth' };
  if (code === 'guest_limit') return { kind: 'guest_limit' };
  if (code === 'video_too_long') {
    return { kind: 'message', tone: 'error', messageKey: 'snap.videoTooLong', serverMessage: result.message };
  }
  if (code === 'invalid_url') return { kind: 'message', tone: 'error', messageKey: 'snap.invalidUrl' };
  if (code === 'gate_unavailable') return { kind: 'message', tone: 'error', messageKey: 'snap.gateFailed' };
  if (code === 'daily_limit') return { kind: 'message', tone: 'info', messageKey: 'snap.gateDailyLimit' };
  // No answer, or out of time (refunded): try again. Never the transport's own text.
  if (code === NO_RESPONSE_CODE || code === 'extraction_timeout') {
    return { kind: 'message', tone: 'error', messageKey: 'snap.genericError' };
  }
  if (isFoodGateReject(code)) {
    return { kind: 'message', tone: 'error', messageKey: result.platform === 'photo' ? 'snap.notFood' : 'snap.notFoodLink' };
  }
  if (shouldOfferInvent(code) && canOfferInvent) {
    return { kind: 'offer_invent', dishGuess: result.dish_guess, allowExtract: code === 'looks_like_dish' };
  }
  if (result.cached && result.recipe && 'id' in result.recipe) {
    return { kind: 'saved', recipe: result.recipe };
  }
  if (result.status === 'coming_soon') {
    return { kind: 'message', tone: 'info', messageKey: 'snap.comingSoon', serverMessage: result.message };
  }
  if (result.status === 'failed' || !result.recipe) {
    return { kind: 'message', tone: 'error', messageKey: 'snap.notFound', serverMessage: result.message };
  }
  if (result.status === 'partial' && !result.cached && !recipeIsInvented(result.recipe)) {
    return { kind: 'partial', recipe: result.recipe, missingIngredients: result.recipe.ingredients.length === 0 };
  }
  return { kind: 'preview', recipe: result.recipe };
}

/**
 * True when the request id can be forgotten as soon as the result arrives: nothing to keep (no recipe, or the saved
 * one), and the charge is settled. A recipe's id is forgotten only once the recipe is stored, so a reload can't
 * lose a paid import.
 */
export function requestSettledWithoutRecipe(result: ExtractResult): boolean {
  return Boolean(
    (!result.recipe || result.cached) && result.request_id && !extractionOutcomeIsUncertain(result.code),
  );
}
