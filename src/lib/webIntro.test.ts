import { describe, expect, it } from 'vitest';

import { isAppHome, isWebIntroDismissedValue, shouldRedirectToWebIntro } from '@/lib/webIntro';

describe('isWebIntroDismissedValue', () => {
  it('is true only for the stored flag', () => {
    expect(isWebIntroDismissedValue('true')).toBe(true);
    expect(isWebIntroDismissedValue(null)).toBe(false);
    expect(isWebIntroDismissedValue('false')).toBe(false);
    expect(isWebIntroDismissedValue('')).toBe(false);
  });
});

describe('isAppHome', () => {
  it('matches the library front door', () => {
    expect(isAppHome('/')).toBe(true);
    expect(isAppHome('')).toBe(true);
    expect(isAppHome('/index')).toBe(true);
    expect(isAppHome('/(tabs)')).toBe(true);
  });

  it('leaves deep links and the intro route alone', () => {
    expect(isAppHome('/welcome')).toBe(false);
    expect(isAppHome('/onboarding')).toBe(false);
    expect(isAppHome('/recipe/abc')).toBe(false);
    expect(isAppHome('/auth-callback')).toBe(false);
  });
});

describe('shouldRedirectToWebIntro', () => {
  const freshWebHome = {
    isWeb: true,
    ready: true,
    dismissed: false,
    pathname: '/',
  };

  it('shows the intro to a web visitor on the home page', () => {
    expect(shouldRedirectToWebIntro(freshWebHome)).toBe(true);
  });

  it('hides the intro only after they continue during this visit', () => {
    expect(shouldRedirectToWebIntro({ ...freshWebHome, dismissed: true })).toBe(false);
  });

  it('waits until storage has been read', () => {
    expect(shouldRedirectToWebIntro({ ...freshWebHome, ready: false })).toBe(false);
  });

  it('stays off native and off deep links', () => {
    expect(shouldRedirectToWebIntro({ ...freshWebHome, isWeb: false })).toBe(false);
    expect(shouldRedirectToWebIntro({ ...freshWebHome, pathname: '/s/token' })).toBe(false);
    expect(shouldRedirectToWebIntro({ ...freshWebHome, pathname: '/welcome' })).toBe(false);
  });
});
