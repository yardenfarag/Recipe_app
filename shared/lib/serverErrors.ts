/**
 * The app's own words for what the server reports (PIN-153).
 *
 * The server answers in English, and some client-library errors are raw English too ("Edge Function returned a
 * non-2xx status code"). Hebrew, Arabic, Spanish and Russian users saw those as they were. The server also sends
 * a stable `code`; these functions turn a code into a translation key, with a translated fallback for anything
 * they don't know. Both apps use them, each with its own `t`.
 */

type Translate = (key: string) => string;

/** Codes from extract-recipe and invent-recipe (see _shared/extraction/fetchErrorMessage.ts for the fetch ones). */
const IMPORT_ERROR_KEYS: Record<string, string> = {
  source_timeout: 'serverErrors.sourceTimeout',
  try_again: 'serverErrors.tryAgain',
  site_blocked: 'serverErrors.siteBlocked',
  page_gone: 'serverErrors.pageGone',
  site_busy: 'serverErrors.siteBusy',
  not_a_webpage: 'serverErrors.notAWebpage',
  site_unreachable: 'serverErrors.siteUnreachable',
  rate_limited: 'serverErrors.rateLimited',
  post_private: 'serverErrors.postPrivate',
  page_unreadable: 'serverErrors.pageUnreadable',
  source_unavailable: 'serverErrors.sourceUnavailable',
  invalid_url: 'snap.invalidUrl',
  video_too_long: 'snap.videoTooLong',
  extraction_timeout: 'snap.timedOut',
  no_recipe: 'snap.notFound',
  pdf_no_recipe: 'snap.pdfNotFound',
  pdf_too_large: 'snap.pdfTooLarge',
  pdf_too_many_pages: 'snap.pdfTooManyPages',
  pdf_unreadable: 'snap.pdfUnreadable',
  pdf_timed_out: 'snap.pdfTimedOut',
  no_response: 'snap.genericError',
  metering_error: 'snap.genericError',
  compensation_pending: 'snap.genericError',
};

/** The translation key for an import failure code, or null for a code this build doesn't know. */
export function importErrorKey(code: string | null | undefined): string | null {
  return (code && IMPORT_ERROR_KEYS[code]) || null;
}

/**
 * What to show when an import fails. A known code gets its translation. For an unknown one the server's English
 * message is the most specific thing there is, so English readers get it; everyone else gets `fallbackKey`.
 */
export function importErrorText(
  result: { code?: string | null; message?: string | null },
  t: Translate,
  language: string,
  fallbackKey = 'snap.genericError',
): string {
  return serverErrorText(result, t, language, fallbackKey, IMPORT_ERROR_KEYS);
}

/** Codes from translate-recipe (PIN-158). `daily_limit` is the 10-a-day cap. */
export const TRANSLATE_ERROR_KEYS: Record<string, string> = {
  auth_required: 'serverErrors.signInAgain',
  daily_limit: 'recipe.translateDailyLimit',
  translation_empty: 'serverErrors.translateFailed',
  translation_timeout: 'serverErrors.translateTimedOut',
};

/**
 * Codes from transform-recipe. The remix sheets handle `recipe_limit` and `daily_limit` themselves (the message
 * carries the limit), and `auth_required` sends the cook to sign in.
 */
export const REMIX_ERROR_KEYS: Record<string, string> = {
  auth_required: 'serverErrors.signInAgain',
  instruction_unrelated: 'recipe.remixUnrelated',
  remix_empty: 'serverErrors.remixNoResult',
};

/** Codes from repair-recipe. The caller handles `insufficient_credits` and the guest codes before this. */
export const REPAIR_ERROR_KEYS: Record<string, string> = {
  auth_required: 'serverErrors.signInAgain',
  no_improvement: 'recipe.repairNoImprovement',
  not_partial: 'serverErrors.repairNotPartial',
  repair_failed: 'serverErrors.repairFailed',
};

/** Codes from suggest-substitution. */
export const SWAP_ERROR_KEYS: Record<string, string> = {
  auth_required: 'serverErrors.signInAgain',
  daily_limit: 'serverErrors.swapDailyLimit',
  no_substitute: 'recipe.swapFailed',
};

/** Codes from recipe-share: sharing a recipe, opening a link and saving from one. */
export const SHARE_ERROR_KEYS: Record<string, string> = {
  auth_required: 'serverErrors.signInAgain',
  share_not_found: 'recipe.shareNotFound',
  share_unavailable: 'serverErrors.shareUnavailable',
  recipe_not_found: 'recipe.notFound',
  recipe_not_saved: 'recipe.shareNeedsSaveBody',
};

/**
 * Codes whose server message is not for people (`metering_error`) or says no more than the screen's own fallback
 * ("Something went wrong…"). Every reader gets `fallbackKey` for these, English readers included.
 */
const GENERAL_CODES = new Set([
  'metering_error',
  'compensation_pending',
  'server_misconfigured',
  'recipe_identity_required',
  'reservation_required',
  'reservation_settled',
  'sealed_recipe_required',
  'translation_failed',
  'remix_failed',
  'substitution_failed',
  'rewrite_empty',
  'rewrite_failed',
  'share_failed',
  'claim_failed',
  'recipe_invalid',
]);

/**
 * What to show when a server call fails, in the reader's language. `codes` maps that function's codes to
 * translation keys (the `*_ERROR_KEYS` above). A code that isn't there gets `fallbackKey`, except that English
 * readers see the server's own message, which may say more, as for imports.
 */
export function serverErrorText(
  result: { code?: string | null; message?: string | null },
  t: Translate,
  language: string,
  fallbackKey: string,
  codes: Record<string, string>,
): string {
  const code = result.code ?? '';
  const key = Object.prototype.hasOwnProperty.call(codes, code) ? codes[code] : undefined;
  if (key) return t(key);
  if (GENERAL_CODES.has(code)) return t(fallbackKey);
  if (language === 'en' && result.message) return result.message;
  return t(fallbackKey);
}

/** Supabase Auth error codes the app has words for. */
const AUTH_CODE_KEYS: Record<string, string> = {
  invalid_credentials: 'serverErrors.auth.invalidCredentials',
  email_not_confirmed: 'serverErrors.auth.emailNotConfirmed',
  over_request_rate_limit: 'serverErrors.auth.tooManyAttempts',
  over_email_send_rate_limit: 'serverErrors.auth.tooManyAttempts',
  weak_password: 'serverErrors.auth.weakPassword',
  same_password: 'serverErrors.auth.samePassword',
  otp_expired: 'auth.codeInvalid',
  otp_disabled: 'auth.codeInvalid',
};

/** What failed, for an auth error with a code the app has no words for. Same actions as shared/lib/supabase/auth.ts. */
const AUTH_ACTION_KEYS: Record<string, string> = {
  signin: 'serverErrors.auth.signinFailed',
  signup: 'serverErrors.auth.signupFailed',
  social: 'serverErrors.auth.socialFailed',
  reset: 'serverErrors.auth.resetFailed',
  update: 'serverErrors.auth.updateFailed',
  code: 'serverErrors.auth.codeFailed',
};

/**
 * What to show when signing in, signing up or changing a password fails. `err` is what the auth helpers throw
 * (an Error with Supabase's `code` and the `action` that failed). Anything else, such as a cancelled Google
 * sign-in or a network error, gets `fallbackKey`. The error's own English message is never shown.
 */
export function authErrorText(err: unknown, t: Translate, fallbackKey: string): string {
  const fields = err && typeof err === 'object' ? (err as { code?: unknown; action?: unknown }) : {};
  const code = typeof fields.code === 'string' ? fields.code : '';
  const action = typeof fields.action === 'string' ? fields.action : '';
  return t(AUTH_CODE_KEYS[code] ?? AUTH_ACTION_KEYS[action] ?? fallbackKey);
}

/**
 * The translation key for a support ticket or feedback the database refused: a sixth message in an hour comes
 * back as `rate_limited`. Null for any other error, which the form handles as before.
 */
export function supportErrorKey(err: unknown): string | null {
  const message = err && typeof err === 'object' && 'message' in err ? String((err as { message?: unknown }).message ?? '') : '';
  return message.includes('rate_limited') ? 'serverErrors.tooManyMessages' : null;
}
