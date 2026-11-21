import { describe, expect, it } from 'vitest';

import {
  applyMetadataUpdate,
  cleanPreferences,
  missingFromAccount,
  preferencesUpdate,
  readAccountPreferences,
  samePreferences,
} from './userPreferences';

describe('readAccountPreferences', () => {
  it('reads prefs and the top-level locale', () => {
    expect(
      readAccountPreferences({ locale: 'he', prefs: { scheme: 'dark', pack: 'dracula', measurement: 'metric' } }),
    ).toEqual({ scheme: 'dark', pack: 'dracula', measurement: 'metric', language: 'he' });
  });

  it('ignores bad values instead of throwing', () => {
    expect(readAccountPreferences({ locale: 'fr', prefs: { scheme: 'neon', pack: 42, measurement: ['metric'] } })).toEqual({});
    expect(readAccountPreferences({ prefs: 'dark' })).toEqual({});
    expect(readAccountPreferences({ prefs: ['dark'] })).toEqual({});
    expect(readAccountPreferences({ prefs: null, locale: null })).toEqual({});
    expect(readAccountPreferences(null)).toEqual({});
    expect(readAccountPreferences(undefined)).toEqual({});
    expect(readAccountPreferences('nope')).toEqual({});
  });

  it('keeps the good fields next to bad ones', () => {
    expect(readAccountPreferences({ locale: 'xx', prefs: { scheme: 'light', pack: 'nope' } })).toEqual({ scheme: 'light' });
  });

  it('reads the old "potter" pack as "wizard"', () => {
    expect(readAccountPreferences({ prefs: { pack: 'potter' } })).toEqual({ pack: 'wizard' });
  });

  it('does not read a language from prefs (locale is the one place)', () => {
    expect(readAccountPreferences({ prefs: { language: 'he' } })).toEqual({});
  });
});

describe('preferencesUpdate', () => {
  it('writes the whole prefs object, keeping what the account already has', () => {
    const metadata = { locale: 'en', avatar: 'x', prefs: { scheme: 'dark', pack: 'mist', futureKey: 1 } };
    expect(preferencesUpdate(metadata, { pack: 'dracula' })).toEqual({
      prefs: { scheme: 'dark', pack: 'dracula', futureKey: 1 },
    });
  });

  it('writes the language as the top-level locale only', () => {
    expect(preferencesUpdate({ locale: 'en', prefs: { scheme: 'dark' } }, { language: 'he' })).toEqual({ locale: 'he' });
  });

  it('returns null when nothing changes', () => {
    const metadata = { locale: 'he', prefs: { scheme: 'dark', measurement: 'metric' } };
    expect(preferencesUpdate(metadata, { language: 'he', scheme: 'dark', measurement: 'metric' })).toBeNull();
    expect(preferencesUpdate(metadata, {})).toBeNull();
  });

  it('drops bad values from the changes', () => {
    expect(preferencesUpdate({}, { scheme: 'neon' as never, measurement: 'metric' })).toEqual({ prefs: { measurement: 'metric' } });
  });

  it('starts a fresh prefs object when the account has a bad one', () => {
    expect(preferencesUpdate({ prefs: 'dark' }, { scheme: 'light' })).toEqual({ prefs: { scheme: 'light' } });
    expect(preferencesUpdate(null, { scheme: 'light', language: 'ar' })).toEqual({ locale: 'ar', prefs: { scheme: 'light' } });
  });

  it('merges one level deep, as GoTrue does', () => {
    const metadata = { locale: 'en', name: 'Cook', prefs: { scheme: 'dark' } };
    const data = preferencesUpdate(metadata, { pack: 'wizard', language: 'es' })!;
    expect(applyMetadataUpdate(metadata, data)).toEqual({
      locale: 'es',
      name: 'Cook',
      prefs: { scheme: 'dark', pack: 'wizard' },
    });
  });
});

describe('missingFromAccount', () => {
  it('is what the device chose and the account lacks', () => {
    expect(
      missingFromAccount({ language: 'he' }, { language: 'en', scheme: 'dark', pack: 'dracula' }),
    ).toEqual({ scheme: 'dark', pack: 'dracula' });
  });

  it('is empty when the account has everything, or the device chose nothing', () => {
    expect(
      missingFromAccount(
        { language: 'he', scheme: 'light', pack: 'mist', measurement: 'original' },
        { language: 'en', scheme: 'dark', pack: 'dracula', measurement: 'metric' },
      ),
    ).toEqual({});
    expect(missingFromAccount({}, {})).toEqual({});
  });

  it('ignores bad device values', () => {
    expect(missingFromAccount({}, { scheme: 'neon' as never, measurement: 'metric' })).toEqual({ measurement: 'metric' });
  });
});

describe('cleanPreferences / samePreferences', () => {
  it('cleans and compares', () => {
    expect(cleanPreferences({ scheme: 'system', extra: 1, language: 'ru' })).toEqual({ scheme: 'system', language: 'ru' });
    expect(samePreferences({ scheme: 'dark' }, { scheme: 'dark' })).toBe(true);
    expect(samePreferences({ scheme: 'dark' }, { scheme: 'dark', pack: 'mist' })).toBe(false);
  });
});
