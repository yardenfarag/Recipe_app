import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BEST_VALUE_PACK_ID,
  CREDIT_PACKS,
  creditPurchasesOfferedOn,
  displayCreditPacks,
  WEB_CREDIT_PURCHASES_ENABLED,
} from '@/lib/purchases';

describe('credit pack catalog', () => {
  it('uses USD catalog prices when the store has not returned products', () => {
    expect(displayCreditPacks()).toEqual([
      { id: 'pinch_credits_10', credits: 10, price: '$1.99', storePackage: undefined },
      { id: 'pinch_credits_30', credits: 30, price: '$4.99', storePackage: undefined },
      { id: 'pinch_credits_100', credits: 100, price: '$7.99', storePackage: undefined },
    ]);
  });

  it('prefers localized store prices when the offering includes the pack', () => {
    const packs = displayCreditPacks([
      { product: { identifier: 'pinch_credits_10', priceString: '₪7.90' } },
      { product: { identifier: 'pinch_credits_100', priceString: '₪49.90' } },
    ]);

    expect(packs.map((pack) => pack.price)).toEqual(['₪7.90', '$4.99', '₪49.90']);
    expect(packs[0]?.storePackage?.product.identifier).toBe('pinch_credits_10');
    expect(packs[1]?.storePackage).toBeUndefined();
  });

  it('keeps credit purchases off the website until Paddle is configured', () => {
    // Tests run without the EXPO_PUBLIC_PADDLE_* settings.
    expect(WEB_CREDIT_PURCHASES_ENABLED).toBe(false);
    expect(creditPurchasesOfferedOn('web')).toBe(false);
    expect(creditPurchasesOfferedOn('ios')).toBe(true);
    expect(creditPurchasesOfferedOn('android')).toBe(true);
  });

  describe('on the website, with Paddle set up', () => {
    beforeEach(() => {
      vi.resetModules();
      vi.stubEnv('EXPO_PUBLIC_PADDLE_CLIENT_TOKEN', 'live_token');
      vi.stubEnv('EXPO_PUBLIC_PADDLE_PRICE_10', 'pri_10');
      vi.stubEnv('EXPO_PUBLIC_PADDLE_PRICE_30', 'pri_30');
      vi.stubEnv('EXPO_PUBLIC_PADDLE_PRICE_100', 'pri_100');
    });
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('still says "buy in the app" while purchases are switched off', async () => {
      vi.stubEnv('EXPO_PUBLIC_CREDIT_PURCHASES_ENABLED', 'false');
      const purchases = await import('@/lib/purchases');
      expect(purchases.creditPurchasesOfferedOn('web')).toBe(false);
    });

    it('sells packs once purchases are switched on', async () => {
      vi.stubEnv('EXPO_PUBLIC_CREDIT_PURCHASES_ENABLED', 'true');
      const purchases = await import('@/lib/purchases');
      expect(purchases.creditPurchasesOfferedOn('web')).toBe(true);
    });

    it('stays off when a price id is missing', async () => {
      vi.stubEnv('EXPO_PUBLIC_CREDIT_PURCHASES_ENABLED', 'true');
      vi.stubEnv('EXPO_PUBLIC_PADDLE_PRICE_30', '');
      const purchases = await import('@/lib/purchases');
      expect(purchases.creditPurchasesOfferedOn('web')).toBe(false);
    });
  });

  it('marks the 100-credit pack as best value', () => {
    expect(BEST_VALUE_PACK_ID).toBe('pinch_credits_100');
    expect(CREDIT_PACKS.map((pack) => pack.id)).toContain(BEST_VALUE_PACK_ID);
  });
});
