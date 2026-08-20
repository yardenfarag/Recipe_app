import { describe, expect, it } from 'vitest';

import {
  BEST_VALUE_PACK_ID,
  CREDIT_PACKS,
  displayCreditPacks,
} from '@/lib/purchases';

describe('credit pack catalog', () => {
  it('uses USD catalog prices when the store has not returned products', () => {
    expect(displayCreditPacks()).toEqual([
      { id: 'pinch_credits_10', credits: 10, price: '$1.99', storePackage: undefined },
      { id: 'pinch_credits_30', credits: 30, price: '$4.99', storePackage: undefined },
      { id: 'pinch_credits_100', credits: 100, price: '$12.99', storePackage: undefined },
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

  it('marks the 100-credit pack as best value', () => {
    expect(BEST_VALUE_PACK_ID).toBe('pinch_credits_100');
    expect(CREDIT_PACKS.map((pack) => pack.id)).toContain(BEST_VALUE_PACK_ID);
  });
});
