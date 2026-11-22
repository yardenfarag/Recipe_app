import { describe, expect, it } from 'vitest';

import {
  NEW_ACCOUNT_WINDOW_MS,
  accountOnboardedAt,
  isNewAccount,
  onboardedMetadata,
  shouldOfferOnboarding,
} from './onboardingAccount';

const NOW = Date.parse('2026-11-21T12:00:00.000Z');
const justNow = new Date(NOW - 60_000).toISOString();
const lastWeek = new Date(NOW - 7 * 24 * 60 * 60 * 1000).toISOString();

describe('accountOnboardedAt', () => {
  it('reads the date the account finished onboarding', () => {
    expect(accountOnboardedAt({ onboarded_at: '2026-11-20T10:00:00.000Z', locale: 'he' })).toBe('2026-11-20T10:00:00.000Z');
  });

  it('ignores a missing or broken value', () => {
    expect(accountOnboardedAt(undefined)).toBeNull();
    expect(accountOnboardedAt(null)).toBeNull();
    expect(accountOnboardedAt([])).toBeNull();
    expect(accountOnboardedAt({})).toBeNull();
    expect(accountOnboardedAt({ onboarded_at: true })).toBeNull();
    expect(accountOnboardedAt({ onboarded_at: 'soon' })).toBeNull();
    expect(accountOnboardedAt({ onboarded_at: '2026-11-20'.padEnd(50, 'x') })).toBeNull();
  });
});

describe('onboardedMetadata', () => {
  it('writes only its own top-level key, so prefs and locale are untouched', () => {
    expect(onboardedMetadata(new Date(NOW))).toEqual({ onboarded_at: '2026-11-21T12:00:00.000Z' });
  });
});

describe('isNewAccount', () => {
  it('is true inside the window and false after it', () => {
    expect(isNewAccount(justNow, NOW)).toBe(true);
    expect(isNewAccount(new Date(NOW - NEW_ACCOUNT_WINDOW_MS + 1000).toISOString(), NOW)).toBe(true);
    expect(isNewAccount(new Date(NOW - NEW_ACCOUNT_WINDOW_MS).toISOString(), NOW)).toBe(false);
    expect(isNewAccount(lastWeek, NOW)).toBe(false);
  });

  it('treats an unknown date as an old account', () => {
    expect(isNewAccount(undefined, NOW)).toBe(false);
    expect(isNewAccount('', NOW)).toBe(false);
    expect(isNewAccount('not a date', NOW)).toBe(false);
  });
});

describe('shouldOfferOnboarding', () => {
  it('offers it to a brand-new account', () => {
    expect(shouldOfferOnboarding({ metadata: { locale: 'en' }, createdAt: justNow }, NOW)).toBe(true);
  });

  it('never asks an account that finished on another device', () => {
    expect(shouldOfferOnboarding({ metadata: { onboarded_at: justNow }, createdAt: justNow }, NOW)).toBe(false);
  });

  it('never asks an account from before the key existed', () => {
    expect(shouldOfferOnboarding({ metadata: {}, createdAt: lastWeek }, NOW)).toBe(false);
  });
});
