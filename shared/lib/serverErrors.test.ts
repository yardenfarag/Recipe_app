import { describe, expect, it } from 'vitest';

import ar from '../i18n/locales/ar';
import en from '../i18n/locales/en';
import es from '../i18n/locales/es';
import he from '../i18n/locales/he';
import ru from '../i18n/locales/ru';
import {
  authErrorText,
  importErrorKey,
  importErrorText,
  REMIX_ERROR_KEYS,
  REPAIR_ERROR_KEYS,
  serverErrorText,
  SHARE_ERROR_KEYS,
  supportErrorKey,
  SWAP_ERROR_KEYS,
  TRANSLATE_ERROR_KEYS,
} from './serverErrors';

/** A `t` over a real locale file, so a mapped key that doesn't exist fails the test. */
function translator(locale: Record<string, unknown>) {
  return (key: string): string => {
    const value = key.split('.').reduce<unknown>(
      (node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined),
      locale,
    );
    if (typeof value !== 'string') throw new Error(`missing translation: ${key}`);
    return value;
  };
}

const tEn = translator(en);
const tHe = translator(he);

/** Every code the server sends for a failed import (fetchErrorMessage.ts, extract-recipe, invent-recipe). */
const SERVER_IMPORT_CODES = [
  'source_timeout',
  'try_again',
  'site_blocked',
  'page_gone',
  'site_busy',
  'not_a_webpage',
  'site_unreachable',
  'rate_limited',
  'post_private',
  'invalid_url',
  'page_unreadable',
  'source_unavailable',
  'video_too_long',
  'extraction_timeout',
  'no_recipe',
  'pdf_no_recipe',
  'pdf_too_large',
  'pdf_too_many_pages',
  'pdf_unreadable',
  'pdf_timed_out',
  'no_response',
  'metering_error',
  'compensation_pending',
];

describe('import errors', () => {
  it('every server code has words in the app, in a real translation', () => {
    for (const code of SERVER_IMPORT_CODES) {
      expect(importErrorKey(code), code).not.toBeNull();
      expect(tHe(importErrorKey(code)!)).toMatch(/[֐-׿]/);
    }
  });

  it('a Hebrew reader never sees the server’s English', () => {
    const blocked = { code: 'site_blocked', message: "This site doesn't let apps read its pages." };
    expect(importErrorText(blocked, tHe, 'he')).toBe(tHe('serverErrors.siteBlocked'));
    // A code this build doesn't know, and a failure with no code at all.
    expect(importErrorText({ code: 'brand_new_code', message: 'Brand new English text' }, tHe, 'he')).toBe(tHe('snap.genericError'));
    expect(importErrorText({ message: 'Edge Function returned a non-2xx status code' }, tHe, 'he', 'snap.notFound')).toBe(
      tHe('snap.notFound'),
    );
  });

  it('an English reader keeps the server’s more specific words for a code the app does not know', () => {
    expect(importErrorText({ code: 'brand_new_code', message: 'Brand new English text' }, tEn, 'en')).toBe('Brand new English text');
    expect(importErrorText({ code: 'brand_new_code' }, tEn, 'en')).toBe(tEn('snap.genericError'));
    expect(importErrorText({ code: 'page_gone', message: 'server words' }, tEn, 'en')).toBe(tEn('serverErrors.pageGone'));
  });
});

/**
 * Every code each recipe action's Edge Function sends that reaches the text, and the fallback the app passes
 * (PIN-158). Codes a caller handles first (sign-in redirects, the credits sheet, the remix limit) are left out.
 */
const RECIPE_ACTIONS = {
  'translate-recipe': {
    keys: TRANSLATE_ERROR_KEYS,
    fallback: 'serverErrors.translateFailed',
    codes: ['auth_required', 'daily_limit', 'metering_error', 'translation_empty', 'translation_timeout', 'translation_failed'],
  },
  'transform-recipe': {
    keys: REMIX_ERROR_KEYS,
    fallback: 'recipe.remixFailed',
    codes: ['server_misconfigured', 'metering_error', 'instruction_unrelated', 'recipe_identity_required', 'remix_empty', 'remix_failed'],
  },
  'repair-recipe': {
    keys: REPAIR_ERROR_KEYS,
    fallback: 'recipe.repairFailed',
    codes: [
      'metering_error',
      'reservation_required',
      'not_partial',
      'no_improvement',
      'repair_failed',
      'reservation_settled',
      'compensation_pending',
      'sealed_recipe_required',
    ],
  },
  'suggest-substitution': {
    keys: SWAP_ERROR_KEYS,
    fallback: 'recipe.swapFailed',
    codes: ['auth_required', 'metering_error', 'daily_limit', 'no_substitute', 'substitution_failed', 'rewrite_empty', 'rewrite_failed'],
  },
  'recipe-share': {
    keys: SHARE_ERROR_KEYS,
    fallback: 'common.tryAgain',
    codes: [
      'auth_required',
      'server_misconfigured',
      'share_not_found',
      'share_unavailable',
      'recipe_not_found',
      'recipe_not_saved',
      'recipe_invalid',
      'share_failed',
      'claim_failed',
    ],
  },
};

/** Each non-English locale, with a check that a text is really written in it. */
const OTHER_LOCALES = [
  { name: 'he', t: tHe, written: (text: string) => /[֐-׿]/.test(text) },
  { name: 'ar', t: translator(ar), written: (text: string) => /[؀-ۿ]/.test(text) },
  { name: 'ru', t: translator(ru), written: (text: string) => /[Ѐ-ӿ]/.test(text) },
  { name: 'es', t: translator(es), written: (text: string) => text !== '' },
];

describe('recipe action and share errors', () => {
  it.each(Object.entries(RECIPE_ACTIONS))('every %s code has words in all five languages', (_fn, action) => {
    for (const code of action.codes) {
      const server = { code, message: 'English from the server' };
      const english = serverErrorText(server, tEn, 'en', action.fallback, action.keys);
      expect(english, code).not.toBe(server.message);
      for (const locale of OTHER_LOCALES) {
        const text = serverErrorText(server, locale.t, locale.name, action.fallback, action.keys);
        expect(locale.written(text), `${code} in ${locale.name}`).toBe(true);
        if (locale.name === 'es') expect(text, code).not.toBe(english);
      }
    }
  });

  it('a known code gets its own words, not the fallback', () => {
    expect(serverErrorText({ code: 'daily_limit', message: 'daily_limit' }, tHe, 'he', 'serverErrors.translateFailed', TRANSLATE_ERROR_KEYS)).toBe(
      tHe('recipe.translateDailyLimit'),
    );
    expect(serverErrorText({ code: 'translation_timeout' }, tHe, 'he', 'serverErrors.translateFailed', TRANSLATE_ERROR_KEYS)).toBe(
      tHe('serverErrors.translateTimedOut'),
    );
    expect(serverErrorText({ code: 'daily_limit' }, tHe, 'he', 'recipe.swapFailed', SWAP_ERROR_KEYS)).toBe(tHe('serverErrors.swapDailyLimit'));
    expect(serverErrorText({ code: 'share_not_found' }, tHe, 'he', 'common.tryAgain', SHARE_ERROR_KEYS)).toBe(tHe('recipe.shareNotFound'));
  });

  it('a Hebrew reader never sees the server’s English', () => {
    const unknown = { code: 'brand_new_code', message: 'Brand new English text' };
    expect(serverErrorText(unknown, tHe, 'he', 'recipe.remixFailed', REMIX_ERROR_KEYS)).toBe(tHe('recipe.remixFailed'));
    // A failure with no code, such as the client's own "Could not reach…" when the request didn't arrive.
    const noCode = { message: 'Could not reach the substitution service. Please try again.' };
    expect(serverErrorText(noCode, tHe, 'he', 'recipe.swapFailed', SWAP_ERROR_KEYS)).toBe(tHe('recipe.swapFailed'));
  });

  it('an English reader keeps the server’s words for a code the app does not know, but never an internal one', () => {
    const unknown = { code: 'brand_new_code', message: 'Brand new English text' };
    expect(serverErrorText(unknown, tEn, 'en', 'recipe.remixFailed', REMIX_ERROR_KEYS)).toBe('Brand new English text');
    expect(serverErrorText({ message: 'Recipe may include at most 60 ingredients' }, tEn, 'en', 'recipe.remixFailed', REMIX_ERROR_KEYS)).toBe(
      'Recipe may include at most 60 ingredients',
    );
    expect(serverErrorText({ code: 'metering_error', message: 'metering_error' }, tEn, 'en', 'recipe.repairFailed', REPAIR_ERROR_KEYS)).toBe(
      tEn('recipe.repairFailed'),
    );
    expect(serverErrorText({}, tEn, 'en', 'common.tryAgain', SHARE_ERROR_KEYS)).toBe(tEn('common.tryAgain'));
  });

  it('a code named like an object property is just an unknown code', () => {
    expect(serverErrorText({ code: 'toString' }, tHe, 'he', 'common.tryAgain', SHARE_ERROR_KEYS)).toBe(tHe('common.tryAgain'));
  });
});

describe('auth errors', () => {
  const authError = (code: string, action: string) => Object.assign(new Error('English from the helper'), { code, action });

  it('translates the codes Supabase sends', () => {
    expect(authErrorText(authError('invalid_credentials', 'signin'), tHe, 'auth.genericError')).toBe(
      tHe('serverErrors.auth.invalidCredentials'),
    );
    expect(authErrorText(authError('over_email_send_rate_limit', 'reset'), tHe, 'auth.genericError')).toBe(
      tHe('serverErrors.auth.tooManyAttempts'),
    );
    expect(authErrorText(authError('otp_expired', 'code'), tHe, 'auth.genericError')).toBe(tHe('auth.codeInvalid'));
    expect(authErrorText(authError('weak_password', 'update'), tEn, 'auth.genericError')).toBe(tEn('serverErrors.auth.weakPassword'));
  });

  it('an unknown code says which step failed', () => {
    for (const action of ['signin', 'signup', 'social', 'reset', 'update', 'code']) {
      const text = authErrorText(authError('something_new', action), tHe, 'auth.genericError');
      expect(text).toMatch(/[֐-׿]/);
      expect(text).not.toBe(tHe('auth.genericError'));
    }
  });

  it('anything else gets the screen’s fallback, never its own English message', () => {
    expect(authErrorText(new Error('Network request failed'), tHe, 'auth.googleFailed')).toBe(tHe('auth.googleFailed'));
    expect(authErrorText('boom', tHe, 'auth.genericError')).toBe(tHe('auth.genericError'));
    expect(authErrorText(null, tHe, 'auth.genericError')).toBe(tHe('auth.genericError'));
  });
});

describe('support errors', () => {
  it('says so when the hourly limit is reached', () => {
    const fromDatabase = { code: 'P0001', message: 'rate_limited', details: null };
    expect(tHe(supportErrorKey(fromDatabase)!)).toMatch(/[\u0590-\u05FF]/);
    expect(supportErrorKey(new Error('rate_limited'))).toBe('serverErrors.tooManyMessages');
  });

  it('anything else is left to the form', () => {
    expect(supportErrorKey(new Error('permission denied for table support_tickets'))).toBeNull();
    expect(supportErrorKey(null)).toBeNull();
  });
});
