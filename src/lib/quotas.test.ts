import { describe, expect, it } from 'vitest';

import {
  ADMIN_PRICE_CARD,
  FREE_EXTRACT_LIMIT,
  FREE_MONTHLY_EXTRACT_LIMIT,
  freeExtractsRemaining,
  GUEST_EXTRACTION_LIMIT,
  RECIPE_REMIX_LIMIT,
} from '@/lib/quotas';

describe('recipe credits', () => {
  it('keeps monthly free and guest limits', () => {
    expect(FREE_MONTHLY_EXTRACT_LIMIT).toBe(3);
    expect(FREE_EXTRACT_LIMIT).toBe(3);
    expect(GUEST_EXTRACTION_LIMIT).toBe(3);
    expect(RECIPE_REMIX_LIMIT).toBe(5);
    expect(ADMIN_PRICE_CARD.freeExtractLimit).toBe(3);
    expect(ADMIN_PRICE_CARD.guestExtractLimit).toBe(3);
  });

  it('computes remaining extracts', () => {
    expect(freeExtractsRemaining(0)).toBe(3);
    expect(freeExtractsRemaining(3)).toBe(0);
    expect(freeExtractsRemaining(4)).toBe(0);
  });

  it('matches researched Gemini list rates', () => {
    expect(ADMIN_PRICE_CARD.geminiInputUsdPerM).toBe(1.5);
    expect(ADMIN_PRICE_CARD.geminiOutputUsdPerM).toBe(9);
  });
});
