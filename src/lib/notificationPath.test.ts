import { describe, expect, it } from 'vitest';

import { notificationPath } from './notificationPath';

describe('notificationPath', () => {
  it('returns in-app paths', () => {
    expect(notificationPath({ url: '/add' })).toBe('/add');
    expect(notificationPath({ url: '/recipe/abc' })).toBe('/recipe/abc');
  });

  it('ignores anything that would leave the app or is missing', () => {
    expect(notificationPath({ url: 'https://evil.example' })).toBeNull();
    expect(notificationPath({ url: '//evil.example' })).toBeNull();
    expect(notificationPath({ url: '/\\evil.example' })).toBeNull();
    expect(notificationPath({ url: 42 })).toBeNull();
    expect(notificationPath(null)).toBeNull();
    expect(notificationPath(undefined)).toBeNull();
  });
});
