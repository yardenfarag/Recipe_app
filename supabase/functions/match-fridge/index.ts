import { withDailyAiUsage } from '../_shared/core/dailyAiUsage.ts';
import { handler, HttpError } from '../_shared/core/handler.ts';
import { createAuthedSupabase } from '../_shared/core/supabaseAdmin.ts';
import { FRIDGE_MATCH_DAILY_LIMIT } from '../_shared/llm/pricing.ts';
import { matchFridgeToCatalog } from '../_shared/recipes/fridgeMatch.ts';
import { MAX_FRIDGE_MATCH_BODY_BYTES, parseFridgeMatchRequest } from '../_shared/recipes/fridgeMatchRequest.ts';

const meteringError = new HttpError(500, 'metering_error', 'metering_error');
const signIn = new HttpError(401, 'auth_required', 'Sign in to match your fridge.');
const matchFailed = HttpError.withBody(500, {
  status: 'failed',
  message: "Couldn't match that photo to your recipes.",
});

/**
 * POST { image_base64, catalog, guest_install_id? }
 * -> { status, matches?, message? }
 *
 * Free vision ranker over the user's saved recipes. Daily cap only.
 *
 * The body is checked before sign-in (an empty catalog answers without it), so sign-in is checked in the handler.
 */
handler(
  {
    name: 'match-fridge',
    auth: 'none',
    maxBodyBytes: MAX_FRIDGE_MATCH_BODY_BYTES,
    legacyErrorShape: true,
    errors: { misconfigured: meteringError },
    input: parseFridgeMatchRequest,
  },
  async ({ req, input, admin, log }) => {
    const { imageBase64, imageMime, catalog, guestInstallId } = input;
    if (catalog.length === 0) {
      return {
        status: 'ok',
        matches: [],
        code: 'empty_library',
      };
    }

    const authHeader = req.headers.get('Authorization');
    const authed = authHeader ? createAuthedSupabase(authHeader) : null;
    const {
      data: { user },
    } = authed ? await authed.auth.getUser() : { data: { user: null } };
    const userId = user?.id ?? null;
    if (!userId) throw signIn;

    // Set once today's use is reserved, so a failure after it (which gives the use back) is told apart from the
    // quota's own answers.
    let reserved = false;
    try {
      return await withDailyAiUsage(
        admin,
        userId,
        'fridge_match',
        FRIDGE_MATCH_DAILY_LIMIT,
        async () => {
          reserved = true;
          const result = await matchFridgeToCatalog({
            imageBase64,
            mimeType: imageMime,
            catalog,
          });
          await log.usage({
            userId,
            guestInstallId: userId ? null : guestInstallId,
            action: 'fridge_match',
            status: 'ok',
            usages: result.usage ? [result.usage] : [],
            tokensCharged: 0,
            metadata: { match_count: result.matches.length, catalog_size: catalog.length },
          });
          return { status: 'ok', matches: result.matches };
        },
        {
          meteringError,
          onLimited: () =>
            log.usage({
              userId,
              guestInstallId: userId ? null : guestInstallId,
              action: 'fridge_match',
              status: 'daily_limit',
              tokensCharged: 0,
            }),
        },
      );
    } catch (err) {
      if (!reserved) throw err;
      // withDailyAiUsage has given the use back by now, before the failure is logged, as it always was.
      console.error('[match-fridge] error', err);
      await log.usage({
        userId,
        guestInstallId: userId ? null : guestInstallId,
        action: 'fridge_match',
        status: 'error',
        tokensCharged: 0,
        errorMessage: err instanceof Error ? err.message.slice(0, 500) : String(err),
      });
      throw matchFailed;
    }
  },
);
