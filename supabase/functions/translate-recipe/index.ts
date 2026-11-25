import { withDailyAiUsage } from '../_shared/core/dailyAiUsage.ts';
import { handler, HttpError } from '../_shared/core/handler.ts';
import {
  recipeAlreadyInLanguage,
  type TranslateLanguageCode,
  TRANSLATION_VERSION,
  translateRecipeWithLlm,
} from '../_shared/recipes/translateRecipe.ts';
import { MAX_TRANSLATE_BODY_BYTES, parseTranslateRequest } from '../_shared/recipes/translateRequest.ts';

const DAILY_TRANSLATION_LIMIT = 10;

const signIn = new HttpError(401, 'auth_required', 'Sign in to translate recipes.');
const meteringError = new HttpError(500, 'metering_error', 'metering_error');

const ok = (targetLanguage: TranslateLanguageCode, recipe: unknown) => ({
  status: 'ok',
  target_language: targetLanguage,
  // Saved with the cache row; older app builds ignore it (PIN-53).
  translation_version: TRANSLATION_VERSION,
  recipe,
});

/**
 * POST { target_language, recipe } -> { status, recipe?, code?, message? }
 *
 * Failure codes (the app's words for them are in shared/lib/serverErrors.ts): auth_required, metering_error,
 * daily_limit, translation_empty, translation_timeout, translation_failed. Bad requests answer { error }.
 *
 * Translates recipe title, ingredients, and instructions. Free for now
 * (logged for cost tracking); no product-token charge.
 */
handler(
  {
    name: 'translate-recipe',
    auth: 'user',
    maxBodyBytes: MAX_TRANSLATE_BODY_BYTES,
    legacyErrorShape: true,
    errors: { authMissing: signIn, authInvalid: signIn, misconfigured: meteringError },
    input: parseTranslateRequest,
  },
  async ({ input, user, admin, log }) => {
    const { targetLanguage, title, ingredients, instructions } = input;

    // Already in the target language (a wrong source label): hand it back as is, with no model call and no quota.
    if (recipeAlreadyInLanguage(input, targetLanguage)) return ok(targetLanguage, { title, ingredients, instructions });

    // A thrown error gives today's use back (withDailyAiUsage).
    return await withDailyAiUsage(admin, user.id, 'translation', DAILY_TRANSLATION_LIMIT, async () => {
      try {
        const translated = await translateRecipeWithLlm(input);
        const usages = translated.usage ? [translated.usage] : [];

        if (!translated.title.trim()) {
          await log.usage({
            action: 'translate',
            status: 'failed',
            usages,
            tokensCharged: 0,
            metadata: { targetLanguage },
            errorMessage: 'Empty translated title',
          });
          // A 200 with a failed body, as the app has always received it.
          throw new HttpError(200, 'translation_empty', "Couldn't translate this recipe. Try again.");
        }

        const { usage: _usage, ...recipePayload } = translated;
        await log.usage({ action: 'translate', status: 'ok', usages, tokensCharged: 0, metadata: { targetLanguage } });
        return ok(targetLanguage, recipePayload);
      } catch (err) {
        if (err instanceof HttpError) throw err;
        console.error('translate-recipe error:', err);
        const errMessage = err instanceof Error ? err.message : String(err);
        const timedOut = /timedOut=true/i.test(errMessage);
        await log.usage({
          action: 'translate',
          status: 'error',
          tokensCharged: 0,
          errorMessage: errMessage.slice(0, 500),
          metadata: { targetLanguage, timedOut },
        });
        throw new HttpError(
          500,
          timedOut ? 'translation_timeout' : 'translation_failed',
          timedOut
            ? 'Translation timed out. Please try again in a moment.'
            : 'Something went wrong translating the recipe. Please try again.',
        );
      }
    });
  },
);
