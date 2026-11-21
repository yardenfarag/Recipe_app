import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  announceCreditsChanged,
  checkoutIdFrom,
  checkoutSinceIso,
  onCreditsChanged,
  withoutCheckoutId,
} from './webCheckoutReturn';

describe('web checkout return', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads and removes the checkout id Polar adds to the return URL', () => {
    const href = 'https://pinch-app.io/app/settings/credits?checkout_id=abc&tab=1';
    expect(checkoutIdFrom(href)).toBe('abc');
    expect(withoutCheckoutId(href)).toBe('https://pinch-app.io/app/settings/credits?tab=1');
    expect(checkoutIdFrom('https://pinch-app.io/app?checkout_id=')).toBeNull();
    expect(checkoutIdFrom('not a url')).toBeNull();
  });

  it('counts purchases from a minute before the checkout started', () => {
    const now = Date.parse('2026-11-16T15:00:00Z');
    expect(checkoutSinceIso(now - 120_000, now)).toBe('2026-11-16T14:57:00.000Z');
  });

  it('looks back 30 minutes when the start is missing, in the future or too old', () => {
    const now = Date.parse('2026-11-16T15:00:00Z');
    const fallback = '2026-11-16T14:29:00.000Z';
    expect(checkoutSinceIso(null, now)).toBe(fallback);
    expect(checkoutSinceIso(Number.NaN, now)).toBe(fallback);
    expect(checkoutSinceIso(now + 5_000, now)).toBe(fallback);
    expect(checkoutSinceIso(now - 31 * 60_000, now)).toBe(fallback);
  });

  it('tells listeners the balance changed, and does nothing without a window', () => {
    const target = new EventTarget();
    vi.stubGlobal('window', target);
    const listener = vi.fn();
    const stop = onCreditsChanged(listener);
    announceCreditsChanged();
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    announceCreditsChanged();
    expect(listener).toHaveBeenCalledTimes(1);

    vi.stubGlobal('window', undefined);
    expect(() => announceCreditsChanged()).not.toThrow();
    expect(() => onCreditsChanged(listener)()).not.toThrow();
  });
});
