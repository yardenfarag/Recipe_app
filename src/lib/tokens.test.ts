import { describe, expect, it } from 'vitest';

import { ADMIN_PRICE_CARD, TOKEN_COST_EXTRACT, TOKEN_COST_REMIX } from '@/lib/tokens';

describe('token pricing card', () => {
  it('keeps Phase B product prices', () => {
    expect(TOKEN_COST_EXTRACT).toBe(10);
    expect(TOKEN_COST_REMIX).toBe(5);
    expect(ADMIN_PRICE_CARD.signupBonus).toBe(150);
    expect(ADMIN_PRICE_CARD.guestExtractLimit).toBe(3);
  });

  it('matches researched Gemini list rates', () => {
    expect(ADMIN_PRICE_CARD.geminiInputUsdPerM).toBe(1.5);
    expect(ADMIN_PRICE_CARD.geminiOutputUsdPerM).toBe(9);
  });
});
