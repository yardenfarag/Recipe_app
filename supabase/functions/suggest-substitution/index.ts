import { withDailyAiUsage } from '../_shared/core/dailyAiUsage.ts';
import { handler, HttpError } from '../_shared/core/handler.ts';
import type { LlmUsageSnapshot } from '../_shared/llm/pricing.ts';
import { RECIPE_LIMITS, truncateChars } from '../_shared/recipes/recipeLimits.ts';
import {
  rewriteInstructionsForSubstitutionWithLlm,
  suggestSubstitutionsWithLlm,
} from '../_shared/recipes/substitution.ts';
import { MAX_SUBSTITUTION_BODY_BYTES, parseSubstitutionRequest } from '../_shared/recipes/substitutionRequest.ts';

const DAILY_SUBSTITUTION_LIMIT = 20;

const signIn = new HttpError(401, 'auth_required', 'Sign in to use substitutions.');
const meteringError = new HttpError(500, 'metering_error', 'metering_error');
// Both answer with a 200, as the app has always received them.
const noSubstitute = new HttpError(
  200,
  'no_substitute',
  "Couldn't find a good substitute for this ingredient. Try again.",
);
const rewriteEmpty = new HttpError(200, 'rewrite_empty', "Couldn't update the recipe steps for this swap. Try again.");
const substitutionFailed = new HttpError(
  500,
  'substitution_failed',
  'Something went wrong finding a substitute. Please try again.',
);
const rewriteFailed = new HttpError(
  500,
  'rewrite_failed',
  'Something went wrong updating the recipe steps. Please try again.',
);

/**
 * POST suggest: { ingredient, recipe_title, other_ingredients, language? }
 *   -> { status, alternatives?, code?, message? }
 *
 * POST rewrite: { mode: 'rewrite_instructions', ingredient, alternative, instructions, ... }
 *   -> { status, instructions?, code?, message? }
 *
 * Asks the model for supermarket-realistic substitutes, or patches steps after a swap (ADR 005).
 *
 * Failure codes (the app's words for them are in shared/lib/serverErrors.ts): auth_required, metering_error,
 * daily_limit, no_substitute, substitution_failed, rewrite_empty, rewrite_failed. Bad requests answer { error }.
 */
handler(
  {
    name: 'suggest-substitution',
    auth: 'user',
    maxBodyBytes: MAX_SUBSTITUTION_BODY_BYTES,
    legacyErrorShape: true,
    errors: { authMissing: signIn, authInvalid: signIn, misconfigured: meteringError },
    input: parseSubstitutionRequest,
  },
  async ({ input, user, admin, log }) => {
    const rewrite = input.mode === 'rewrite_instructions';
    if (rewrite && input.instructions.length === 0) return { status: 'ok', instructions: [] };
    const metadata = rewrite ? { mode: 'rewrite_instructions' } : undefined;

    // Set once today's use is reserved, so a failure after it (which gives the use back) is told apart from the
    // quota's own answers.
    let reserved = false;
    // The answer that couldn't be used: why, and what the model call cost, for the usage row.
    let unusable = { errorMessage: rewrite ? 'Empty rewrite' : 'No alternatives', usages: [] as LlmUsageSnapshot[] };
    try {
      // A thrown error gives today's use back (withDailyAiUsage).
      return await withDailyAiUsage(admin, user.id, 'substitution', DAILY_SUBSTITUTION_LIMIT, async () => {
        reserved = true;
        if (input.mode === 'rewrite_instructions') {
          const { mode: _mode, ...rewriteInput } = input;
          const { instructions, usage, refused } = await rewriteInstructionsForSubstitutionWithLlm(rewriteInput);
          const usages = usage ? [usage] : [];
          // Empty, or not the recipe's own steps (PIN-186). The apps swap the name in the steps themselves.
          if (instructions.length === 0) {
            unusable = { errorMessage: refused ?? unusable.errorMessage, usages };
            throw rewriteEmpty;
          }
          await log.usage({ action: 'substitution', status: 'ok', usages, tokensCharged: 0, metadata });
          // The app writes these steps to the recipe, so each must fit the database limit (PIN-79). The list is
          // never cut: every step the app sent comes back.
          return {
            status: 'ok',
            instructions: instructions.map((step) => ({ ...step, text: truncateChars(step.text, RECIPE_LIMITS.stepChars) })),
          };
        }

        const { mode: _mode, ...suggestInput } = input;
        const { alternatives, usage } = await suggestSubstitutionsWithLlm(suggestInput);
        const usages = usage ? [usage] : [];
        if (alternatives.length === 0) {
          unusable = { ...unusable, usages };
          throw noSubstitute;
        }
        await log.usage({ action: 'substitution', status: 'ok', usages, tokensCharged: 0 });
        return { status: 'ok', alternatives };
      });
    } catch (err) {
      if (!reserved) throw err;
      // withDailyAiUsage has given the use back by now, before the unusable answer is logged, as it always was.
      if (err === noSubstitute || err === rewriteEmpty) {
        await log.usage({ action: 'substitution', status: 'failed', tokensCharged: 0, ...unusable, metadata });
        throw err;
      }
      console.error(rewrite ? 'suggest-substitution rewrite error:' : 'suggest-substitution error:', err);
      throw rewrite ? rewriteFailed : substitutionFailed;
    }
  },
);
