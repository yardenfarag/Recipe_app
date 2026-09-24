import { describe, expect, it } from 'vitest';

import { creditPurchaseDecision } from '../../supabase/functions/_shared/revenuecatPurchase';

const paidPack = {
  app_user_id: '6757bcb0-ba2b-4e56-a3cb-1f53ee036b9e',
  environment: 'PRODUCTION',
  product_id: 'pinch_credits_100',
  purchased_at_ms: 1790165955000,
  store: 'APP_STORE',
  transaction_id: '450003163722741',
};

describe('creditPurchaseDecision', () => {
  it('grants a credit pack when the purchase payload has no event id or type', () => {
    expect(creditPurchaseDecision(paidPack)).toEqual({
      action: 'grant',
      grant: {
        userId: paidPack.app_user_id,
        credits: 100,
        eventId: paidPack.transaction_id,
        transactionId: paidPack.transaction_id,
        productId: 'pinch_credits_100',
        store: 'APP_STORE',
        environment: 'PRODUCTION',
        purchasedAtMs: paidPack.purchased_at_ms,
      },
    });
  });

  it('grants the same pack from the wrapped webhook body', () => {
    const decision = creditPurchaseDecision({
      event: { ...paidPack, id: 'evt_1', type: 'NON_RENEWING_PURCHASE' },
    });
    expect(decision).toMatchObject({
      action: 'grant',
      grant: { eventId: 'evt_1', credits: 100 },
    });
  });

  it('asks RevenueCat to retry a credit pack that cannot be applied yet', () => {
    expect(
      creditPurchaseDecision({ ...paidPack, app_user_id: '$RCAnonymousID:abc' }),
    ).toEqual({ action: 'retry' });
  });

  it('does not grant a cancellation or an unknown product', () => {
    expect(
      creditPurchaseDecision({ ...paidPack, type: 'CANCELLATION' }),
    ).toEqual({ action: 'ignore' });
    expect(creditPurchaseDecision({ ...paidPack, product_id: 'pinch_plus' })).toEqual({
      action: 'ignore',
    });
  });
});
