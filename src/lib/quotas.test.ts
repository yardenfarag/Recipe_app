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
    expect(FREE_MONTHLY_EXTRACT_LIMIT).toBe(10);
    expect(FREE_EXTRACT_LIMIT).toBe(10);
    expect(GUEST_EXTRACTION_LIMIT).toBe(3);
    expect(RECIPE_REMIX_LIMIT).toBe(5);
    expect(ADMIN_PRICE_CARD.freeExtractLimit).toBe(10);
    expect(ADMIN_PRICE_CARD.guestExtractLimit).toBe(3);
  });

  it('computes remaining extracts', () => {
    expect(freeExtractsRemaining(0)).toBe(10);
    expect(freeExtractsRemaining(3)).toBe(7);
    expect(freeExtractsRemaining(10)).toBe(0);
    expect(freeExtractsRemaining(11)).toBe(0);
  });

  it('keeps the ScrapeCreators credit rate in sync with the server', () => {
    expect(ADMIN_PRICE_CARD.scrapecreatorsUsdPerCredit).toBe(0.00188);
  });
});
