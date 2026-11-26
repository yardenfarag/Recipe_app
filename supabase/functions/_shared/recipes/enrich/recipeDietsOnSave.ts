/**
 * Library recipes get their diets when they are saved (PIN-77), so the meal plan can leave out a recipe that doesn't
 * fit a strict diet. No scheduled job: each way a recipe is made labels it.
 *
 * - An extraction checks the diets in the background, after answering the app: the Hub card's check when a card is
 *   published (no extra model call), a card's earlier answer when it already exists, or a check of its own when no
 *   card is made (the cook doesn't share to the Hub, a photo, a page Pinch doesn't publish). The answer goes to
 *   `remember_recipe_diets`, and the cook's copy takes it when it is saved, or straight away if it already was.
 * - A recipe written or edited through save-recipe-edit is checked after the save whenever its diets are empty
 *   (new, or its ingredients changed).
 * - A recipe saved from the Hub takes its card's diets in the database (the recipes insert trigger).
 */
import type { Db } from '../../core/supabaseAdmin.ts';
import { logUsageEvent } from '../../core/usageLog.ts';
import { fillRecipeCardDiets, type HubPublishDecision } from '../recipeCards.ts';
import { deriveRecipeDiets, type DeriveDietsResult, type DietsRecipeInput } from './recipeDiets.ts';

export type DietsOnSaveDeps = {
  /** The Hub card's check, stored on the card; returns the diets. */
  fillCard: (cardId: string) => Promise<string[] | null>;
  /** A card's diets as stored (an existing card that was checked before). */
  readCard: (cardId: string) => Promise<string[] | null>;
  /** A check of the recipe alone. */
  derive: () => Promise<DeriveDietsResult>;
  /** Logs a check of its own. */
  logOwnCheck: (result: DeriveDietsResult, durationMs: number) => Promise<void>;
};

/**
 * The diets of an extracted recipe, from the Hub decision. Null when unknown (a failed check, a guest with no card,
 * a card not checked yet).
 */
export async function dietsAfterExtract(
  decision: HubPublishDecision,
  userId: string | null,
  deps: DietsOnSaveDeps,
): Promise<string[] | null> {
  if (decision.status !== 'skipped') {
    return decision.needsDiets ? await deps.fillCard(decision.cardId) : await deps.readCard(decision.cardId);
  }
  // Guests save on the device: nothing to label, so no model call.
  if (!userId) return null;
  const started = Date.now();
  const result = await deps.derive();
  await deps.logOwnCheck(result, Date.now() - started);
  return result.diets;
}

/** Keeps the answer for the cook's save, and labels the copy if it was saved already. Never throws. */
export async function rememberRecipeDiets(
  admin: Db,
  userId: string,
  ingredients: unknown,
  diets: string[],
): Promise<void> {
  const { error } = await admin.rpc('remember_recipe_diets', {
    p_user_id: userId,
    p_ingredients: ingredients as never,
    p_diets: diets,
  });
  if (error) console.error('[recipe-diets] remember failed', error);
}

/** extract-recipe's step after the Hub decision: find the diets, and hand them to the cook's copy. Never throws. */
export async function labelExtractedRecipe(
  admin: Db,
  decision: HubPublishDecision,
  recipe: DietsRecipeInput,
  userId: string | null,
): Promise<void> {
  try {
    const diets = await dietsAfterExtract(decision, userId, {
      fillCard: (cardId) => fillRecipeCardDiets(admin, cardId, recipe, userId),
      readCard: async (cardId) => {
        const { data } = await admin.from('recipe_cards').select('diets').eq('id', cardId).maybeSingle();
        return (data?.diets as string[] | null | undefined) ?? null;
      },
      derive: () => deriveRecipeDiets(recipe),
      logOwnCheck: (result, durationMs) => logRecipeDiets(admin, userId, result, durationMs, { source: 'extract' }),
    });
    if (userId && diets) await rememberRecipeDiets(admin, userId, recipe.ingredients, diets);
  } catch (error) {
    console.error('[recipe-diets] extract labelling failed', error);
  }
}

/**
 * save-recipe-edit's step after a save: a recipe whose diets are empty (new, or its ingredients changed) is checked.
 * Writes only while still empty, so a later edit's own check isn't overwritten. Never throws.
 */
export async function labelSavedRecipe(
  admin: Db,
  userId: string,
  recipeId: string,
  recipe: DietsRecipeInput,
): Promise<void> {
  try {
    const started = Date.now();
    const result = await deriveRecipeDiets(recipe);
    await logRecipeDiets(admin, userId, result, Date.now() - started, { source: 'edit', recipe_id: recipeId });
    if (!result.diets) return;
    const { error } = await admin.from('recipes').update({ diets: result.diets }).eq('id', recipeId).eq('user_id', userId).is('diets', null);
    if (error) console.error('[recipe-diets] save failed', error);
  } catch (error) {
    console.error('[recipe-diets] edit labelling failed', error);
  }
}

async function logRecipeDiets(
  admin: Db,
  userId: string | null,
  result: DeriveDietsResult,
  durationMs: number,
  metadata: Record<string, unknown>,
): Promise<void> {
  if (result.usages.length === 0) return;
  await logUsageEvent(admin, {
    userId,
    action: 'recipe_diets',
    status: result.diets === null ? 'failed' : 'ok',
    usages: result.usages,
    tokensCharged: 0,
    durationMs,
    errorMessage: result.error ?? null,
    metadata: { ...metadata, diets: result.diets },
  });
}
