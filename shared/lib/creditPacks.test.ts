import { describe, expect, it } from 'vitest';

import {
  BEST_VALUE_PACK_ID,
  CREDIT_PACKS,
  isCreditPackId,
  pricePerCreditUsd,
  savingsVersusSmallest,
} from './creditPacks';

describe('credit packs', () => {
  it('sells the three packs the backend allowlists, at the catalog prices', () => {
    expect(CREDIT_PACKS.map((pack) => [pack.id, pack.credits, pack.priceUsd])).toEqual([
      ['pinch_credits_10', 10, 1.99],
      ['pinch_credits_30', 30, 4.99],
      ['pinch_credits_100', 100, 7.99],
    ]);
    expect(CREDIT_PACKS.map((pack) => pack.catalogPrice)).toEqual(['$1.99', '$4.99', '$7.99']);
    expect(BEST_VALUE_PACK_ID).toBe('pinch_credits_100');
  });

  it('recognises pack ids', () => {
    expect(isCreditPackId('pinch_credits_30')).toBe(true);
    expect(isCreditPackId('pinch_credits_1000')).toBe(false);
    expect(isCreditPackId(undefined)).toBe(false);
  });

  it('works out the price of one credit and the saving against the smallest pack, never rounding it up', () => {
    expect(pricePerCreditUsd(CREDIT_PACKS[2])).toBeCloseTo(0.0799);
    expect(savingsVersusSmallest(CREDIT_PACKS[0])).toBe(0);
    expect(savingsVersusSmallest(CREDIT_PACKS[1])).toBe(0.16);
    expect(savingsVersusSmallest(CREDIT_PACKS[2])).toBe(0.59);
  });
});
