import { describe, expect, it } from 'vitest';

import {
  ADMIN_PRICE_CARD,
  FREE_EXTRACT_LIMIT,
  freeExtractsRemaining,
  GUEST_EXTRACTION_LIMIT,
  isSubscriptionActive,
  monthlyExtractsRemaining,
  PLUS_MONTHLY_EXTRACT_LIMIT,
  PLUS_PRICE_DISPLAY,
} from '@/lib/quotas';

describe('extract quotas', () => {
  it('keeps free / Plus / guest limits', () => {
    expect(FREE_EXTRACT_LIMIT).toBe(10);
    expect(PLUS_MONTHLY_EXTRACT_LIMIT).toBe(90);
    expect(GUEST_EXTRACTION_LIMIT).toBe(3);
    expect(PLUS_PRICE_DISPLAY).toBe('$6.99/mo');
    expect(ADMIN_PRICE_CARD.freeExtractLimit).toBe(10);
    expect(ADMIN_PRICE_CARD.plusMonthlyExtractLimit).toBe(90);
    expect(ADMIN_PRICE_CARD.guestExtractLimit).toBe(3);
  });

  it('computes remaining extracts', () => {
    expect(freeExtractsRemaining(0)).toBe(10);
    expect(freeExtractsRemaining(10)).toBe(0);
    expect(freeExtractsRemaining(12)).toBe(0);
    expect(monthlyExtractsRemaining(0)).toBe(90);
    expect(monthlyExtractsRemaining(90)).toBe(0);
  });

  it('treats active subscription without expiry as active', () => {
    expect(isSubscriptionActive('active', null)).toBe(true);
    expect(isSubscriptionActive('free', null)).toBe(false);
    expect(isSubscriptionActive('canceled', null)).toBe(false);
    expect(isSubscriptionActive('active', '2000-01-01T00:00:00.000Z')).toBe(false);
  });

  it('matches researched Gemini list rates', () => {
    expect(ADMIN_PRICE_CARD.geminiInputUsdPerM).toBe(1.5);
    expect(ADMIN_PRICE_CARD.geminiOutputUsdPerM).toBe(9);
  });
});
