import { currentUtcDate, refundDailyAiUsage, reserveDailyAiUsage } from '../_shared/core/dailyAiUsage.ts';
import { handler, HttpError } from '../_shared/core/handler.ts';
import { refundRecipeRemix, reserveRecipeRemix } from '../_shared/core/remixUsage.ts';
import { RECIPE_REMIX_LIMIT, REMIX_DAILY_LIMIT } from '../_shared/llm/pricing.ts';
import { appliancesForRecipe, stepsChanged } from '../_shared/recipes/enrich/recipeAppliances.ts';
import { fitRecipeToLimits } from '../_shared/recipes/recipeLimits.ts';
import { remixInstructionIsRelated, transformRecipeWithLlm } from '../_shared/recipes/recipeVariant.ts';
import { MAX_TRANSFORM_BODY_BYTES, parseTransformRequest } from '../_shared/recipes/transformRequest.ts';

const signIn = new HttpError(401, 'auth_required', 'Sign in to remix recipes.');
const misconfigured = new HttpError(500, 'server_misconfigured', 'Server is not configured.');
const meteringError = new HttpError(500, 'metering_error', 'metering_error');
const remixFailed = new HttpError(500, 'remix_failed', 'Something went wrong adapting the recipe. Please try again.');

/** The answer when the per-recipe remix can't be reserved. */
const remixRefused = {
  identity_required: new HttpError(400, 'recipe_identity_required', 'recipe_identity_required'),
  error: meteringError,
  limited: new HttpError(429, 'recipe_limit', 'recipe_limit', { remix_limit: RECIPE_REMIX_LIMIT }),
};

/**
 * POST { variant, recipe, recipe_id?, original_url? } -> { status, recipe?, code?, message? }
 *
 * Adapts a full recipe for a dietary/lifestyle goal (healthier, vegan, etc.).
 * Remix is free for signed-in users and capped at RECIPE_REMIX_LIMIT per recipe.
 *
 * Failure codes (the app's words for them are in shared/lib/serverErrors.ts): auth_required, server_misconfigured,
 * daily_limit, metering_error, instruction_unrelated, recipe_identity_required, recipe_limit, remix_empty,
 * remix_failed. Bad requests answer { error }.
 */
handler(
  {
    name: 'transform-recipe',
    auth: 'user',
    maxBodyBytes: MAX_TRANSFORM_BODY_BYTES,
    legacyErrorShape: true,
    errors: { authMissing: signIn, authInvalid: signIn, misconfigured },
    input: parseTransformRequest,
  },
  async ({ input, user, admin, log }) => {
    const { instruction, variant, title, servings, ingredients, instructions, calories, recipeId, sourceUrl } = input;

    let kitchenAutoApply = input.kitchenAutoApply;
    if (kitchenAutoApply) {
      const { data: kitchenRow } = await admin.from('profiles').select('kitchen').eq('id', user.id).maybeSingle();
      const kitchen = kitchenRow?.kitchen;
      kitchenAutoApply = Boolean(
        kitchen &&
          typeof kitchen === 'object' &&
          !Array.isArray(kitchen) &&
          (kitchen as { autoApplyOnExtract?: unknown }).autoApplyOnExtract === true,
      );
    }

    // Kitchen auto-apply skips the per-recipe limit and users set the flag
    // themselves, so every remix also counts against a daily cap (PIN-54).
    // Not withDailyAiUsage: the refund must come before the per-recipe refund and the usage row, as before.
    const usageDate = currentUtcDate();
    const dailyRemix = await reserveDailyAiUsage(admin, user.id, 'remix', REMIX_DAILY_LIMIT, usageDate);
    if (dailyRemix === 'limited') {
      throw new HttpError(429, 'daily_limit', 'daily_limit', { remix_daily_limit: REMIX_DAILY_LIMIT });
    }
    if (dailyRemix === 'error') throw meteringError;
    const refundDaily = () => refundDailyAiUsage(admin, user.id, 'remix', usageDate);

    if (instruction && !kitchenAutoApply) {
      try {
        const related = await remixInstructionIsRelated(instruction, { title, ingredients });
        if (!related) {
          await refundDaily();
          return new HttpError(400, 'instruction_unrelated', 'instruction_unrelated').toResponse();
        }
      } catch (err) {
        console.error('remix relatedness check failed:', err);
        await refundDaily();
        throw remixFailed;
      }
    }

    const reserved = kitchenAutoApply ? 'ok' : await reserveRecipeRemix(admin, user.id, recipeId, sourceUrl);
    if (reserved !== 'ok') {
      await refundDaily();
      throw remixRefused[reserved];
    }

    const metadata = { variant, recipe_id: recipeId, original_url: sourceUrl, kitchen_auto_apply: kitchenAutoApply };
    const refundAll = async () => {
      await refundDaily();
      if (!kitchenAutoApply) await refundRecipeRemix(admin, user.id, recipeId, sourceUrl);
    };

    try {
      const transformed = await transformRecipeWithLlm({
        variant,
        instruction,
        title,
        servings,
        ingredients,
        instructions,
        calories,
      });

      // The app writes the answer over the recipe, so one that would leave a recipe with steps without any is
      // refused like an empty one (PIN-186).
      const lostSteps = instructions.length > 0 && transformed.instructions.length === 0;
      if (transformed.ingredients.length === 0 || lostSteps) {
        await refundAll();
        await log.usage({
          action: 'remix',
          status: 'failed',
          usages: transformed.usage ? [transformed.usage] : [],
          tokensCharged: 0,
          metadata,
          errorMessage: transformed.ingredients.length === 0 ? 'Empty adapted ingredients' : 'Adapted recipe has no steps',
        });
        // A 200 with a failed body, as the app has always received it.
        return { status: 'failed', code: 'remix_empty', message: "Couldn't adapt this recipe. Try a different option." };
      }

      const { usage: _usage, ...unfitted } = transformed;
      // The app writes this straight to the recipe, so it must fit the database limits (PIN-79).
      // An out-of-range calorie estimate is dropped, and the app keeps none.
      const fitted = fitRecipeToLimits(unfitted);
      const remixed = { ...fitted, calories: fitted.calories ?? undefined };
      const usages = transformed.usage ? [transformed.usage] : [];
      // ADR 017: only re-derive when the steps changed. When `appliances` is left out of the
      // response, the app keeps the recipe's current list.
      let recipePayload: typeof remixed & { appliances?: unknown } = remixed;
      let applianceMetadata: Record<string, unknown> = {};
      if (stepsChanged(instructions, remixed.instructions)) {
        const derived = await appliancesForRecipe(remixed, usages);
        recipePayload = { ...remixed, appliances: derived.appliances };
        applianceMetadata = derived.metadata;
      }

      await log.usage({
        action: 'remix',
        status: 'ok',
        usages,
        tokensCharged: 0,
        metadata: { ...metadata, ...applianceMetadata },
      });
      return { status: 'ok', recipe: recipePayload, variant: variant ?? 'custom', tokens_charged: 0 };
    } catch (err) {
      console.error('transform-recipe error:', err);
      await refundAll();
      await log.usage({
        action: 'remix',
        status: 'error',
        tokensCharged: 0,
        errorMessage: err instanceof Error ? err.message.slice(0, 500) : String(err),
        metadata,
      });
      throw remixFailed;
    }
  },
);
