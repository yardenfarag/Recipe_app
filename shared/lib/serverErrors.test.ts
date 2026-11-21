import { describe, expect, it } from 'vitest';

import en from '../i18n/locales/en';
import he from '../i18n/locales/he';
import { authErrorText, importErrorKey, importErrorText, supportErrorKey } from './serverErrors';

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
