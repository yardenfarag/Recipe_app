import { describe, expect, it } from 'vitest';

import { isPublicRecipePath, safeReturnPath, saveAfterSignInPath } from './authReturnPath';

describe('safeReturnPath', () => {
  it('keeps shared and Hub recipe pages', () => {
    expect(safeReturnPath('/s/abc_DEF-123?save=1')).toBe('/s/abc_DEF-123?save=1');
    expect(safeReturnPath('/hub/1f2e3d')).toBe('/hub/1f2e3d');
    expect(safeReturnPath(['/hub/1f2e3d?save=1'])).toBe('/hub/1f2e3d?save=1');
  });

  it('drops anything that could leave the recipe pages', () => {
    for (const value of [
      'https://evil.example/s/abc',
      '//evil.example/s/abc',
      '/settings/credits',
      '/s/abc?save=1&next=https://evil.example',
      '/s/../admin/dashboard',
      '/s/',
      '',
      null,
      undefined,
    ]) {
      expect(safeReturnPath(value)).toBeNull();
    }
  });
});

describe('saveAfterSignInPath', () => {
  it('asks the page to save once signed in', () => {
    expect(saveAfterSignInPath('s', ' token123 ')).toBe('/s/token123?save=1');
    expect(saveAfterSignInPath('hub', 'not a slug!')).toBeNull();
  });
});

describe('isPublicRecipePath', () => {
  it('matches only recipe detail pages', () => {
    expect(isPublicRecipePath('/s/token123')).toBe(true);
    expect(isPublicRecipePath('/hub/abc')).toBe(true);
    expect(isPublicRecipePath('/hub')).toBe(false);
    expect(isPublicRecipePath('/settings')).toBe(false);
  });
});
