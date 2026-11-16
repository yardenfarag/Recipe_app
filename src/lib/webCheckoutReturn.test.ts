import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  checkoutIdFrom,
  checkoutStartedSince,
  markCheckoutStarted,
  withoutCheckoutId,
} from '@/lib/webCheckoutReturn';

describe('web checkout return', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads and removes the checkout id Polar adds to the return URL', () => {
    const href = 'https://pinch-app.io/app/settings/credits?checkout_id=abc&tab=1';
    expect(checkoutIdFrom(href)).toBe('abc');
    expect(withoutCheckoutId(href)).toBe('https://pinch-app.io/app/settings/credits?tab=1');
    expect(checkoutIdFrom('https://pinch-app.io/app')).toBeNull();
    expect(checkoutIdFrom('not a url')).toBeNull();
  });

  it('counts purchases from a minute before the checkout started', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('window', {
      sessionStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
      },
    });
    const now = Date.parse('2026-11-16T15:00:00Z');
    markCheckoutStarted(now - 120_000);
    expect(checkoutStartedSince(now)).toBe('2026-11-16T14:57:00.000Z');
  });

  it('looks back 30 minutes when the start time is missing or storage is blocked', () => {
    const now = Date.parse('2026-11-16T15:00:00Z');
    expect(checkoutStartedSince(now)).toBe('2026-11-16T14:29:00.000Z');
  });
});
