import { describe, expect, it } from 'vitest';

import { permanentCreditError } from '../../supabase/functions/_shared/billing/creditErrors';
import {
  creditPurchaseDecision,
  isSandboxEnvironment,
  purchaseEventSummary,
  purchaseUserId,
} from '../../supabase/functions/_shared/billing/revenuecatPurchase';

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
        price: null,
      },
    });
  });

  it('reads what the buyer paid, with the dollar amount beside another currency', () => {
    const priceOf = (fields: Record<string, unknown>) => {
      const decision = creditPurchaseDecision({ ...paidPack, ...fields });
      return decision.action === 'grant' ? decision.grant.price : 'no grant';
    };
    expect(priceOf({ price: 7.99, price_in_purchased_currency: 7.99, currency: 'USD' })).toEqual({
      amount: 7.99,
      currency: 'USD',
      usd: null,
    });
    expect(priceOf({ price: 8.14, price_in_purchased_currency: 29.9, currency: 'ils' })).toEqual({
      amount: 29.9,
      currency: 'ILS',
      usd: 8.14,
    });
    // Only the dollar price, or nothing usable: the grant still goes through.
    expect(priceOf({ price: 7.99, price_in_purchased_currency: null })).toEqual({ amount: 7.99, currency: 'USD', usd: null });
    expect(priceOf({ price: '7.99', currency: 'USD' })).toBeNull();
    expect(priceOf({ price: -1 })).toBeNull();
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

  it('asks RevenueCat to retry a credit pack that names no account anywhere', () => {
    expect(
      creditPurchaseDecision({ ...paidPack, app_user_id: '$RCAnonymousID:abc' }),
    ).toEqual({ action: 'retry' });
    expect(
      creditPurchaseDecision({
        ...paidPack,
        app_user_id: '$RCAnonymousID:abc',
        original_app_user_id: '$RCAnonymousID:abc',
        aliases: ['$RCAnonymousID:abc', 42, null],
      }),
    ).toEqual({ action: 'retry' });
  });

  it('finds the account of a purchase made under an anonymous id', () => {
    const viaOriginal = creditPurchaseDecision({
      ...paidPack,
      app_user_id: '$RCAnonymousID:abc',
      original_app_user_id: paidPack.app_user_id,
    });
    expect(viaOriginal).toMatchObject({ action: 'grant', grant: { userId: paidPack.app_user_id, credits: 100 } });

    const viaAlias = creditPurchaseDecision({
      ...paidPack,
      app_user_id: '$RCAnonymousID:abc',
      original_app_user_id: '$RCAnonymousID:abc',
      aliases: ['$RCAnonymousID:abc', paidPack.app_user_id],
    });
    expect(viaAlias).toMatchObject({ action: 'grant', grant: { userId: paidPack.app_user_id } });
  });

  it('prefers app_user_id over an alias when both are accounts', () => {
    const other = '11111111-2222-4333-8444-555555555555';
    expect(purchaseUserId({ app_user_id: paidPack.app_user_id, aliases: [other] })).toBe(paidPack.app_user_id);
    expect(purchaseUserId({ app_user_id: '$RCAnonymousID:x', aliases: 'nope' })).toBeNull();
  });

  it('takes the pack back when the store refunds it', () => {
    expect(
      creditPurchaseDecision({ event: { ...paidPack, id: 'evt_refund', type: 'CANCELLATION', cancel_reason: 'CUSTOMER_SUPPORT' } }),
    ).toEqual({
      action: 'revoke',
      revoke: {
        userId: paidPack.app_user_id,
        eventId: 'evt_refund',
        transactionIds: [paidPack.transaction_id],
        productId: 'pinch_credits_100',
        store: 'APP_STORE',
        environment: 'PRODUCTION',
      },
    });
  });

  it('matches a refund by either transaction id, and needs at least one', () => {
    expect(
      creditPurchaseDecision({ ...paidPack, type: 'CANCELLATION', original_transaction_id: 'orig-1' }),
    ).toMatchObject({ action: 'revoke', revoke: { transactionIds: [paidPack.transaction_id, 'orig-1'] } });
    expect(
      creditPurchaseDecision({ ...paidPack, type: 'CANCELLATION', original_transaction_id: paidPack.transaction_id }),
    ).toMatchObject({ action: 'revoke', revoke: { transactionIds: [paidPack.transaction_id] } });
    expect(
      creditPurchaseDecision({ ...paidPack, type: 'CANCELLATION', transaction_id: undefined }),
    ).toEqual({ action: 'retry' });
  });

  it('refunds a purchase whose buyer is only known by an anonymous id', () => {
    expect(
      creditPurchaseDecision({ ...paidPack, type: 'CANCELLATION', app_user_id: '$RCAnonymousID:abc' }),
    ).toMatchObject({ action: 'revoke', revoke: { userId: null } });
  });

  it('ignores other event types and unknown products', () => {
    expect(creditPurchaseDecision({ ...paidPack, type: 'TRANSFER' })).toEqual({ action: 'ignore' });
    expect(creditPurchaseDecision({ ...paidPack, type: 'CANCELLATION', product_id: 'pinch_plus' })).toEqual({
      action: 'ignore',
    });
    expect(creditPurchaseDecision({ ...paidPack, product_id: 'pinch_plus' })).toEqual({
      action: 'ignore',
    });
  });

  it('carries the environment so the webhook can refuse sandbox purchases', () => {
    const sandbox = creditPurchaseDecision({ ...paidPack, environment: 'SANDBOX' });
    expect(sandbox).toMatchObject({ action: 'grant', grant: { environment: 'SANDBOX' } });
    expect(isSandboxEnvironment('SANDBOX')).toBe(true);
    expect(isSandboxEnvironment('sandbox')).toBe(true);
    expect(isSandboxEnvironment('PRODUCTION')).toBe(false);
    expect(isSandboxEnvironment(null)).toBe(false);
  });
});

describe('permanentCreditError', () => {
  it('names the failures a retry cannot fix', () => {
    expect(permanentCreditError({ code: '23503', message: 'insert or update on table "purchase_credit_grants" violates foreign key constraint' })).toBe('account_deleted');
    expect(permanentCreditError({ code: 'P0001', message: 'profile_not_found' })).toBe('account_deleted');
    expect(permanentCreditError({ code: 'P0001', message: 'purchase_refunded' })).toBe('refunded_before_grant');
    expect(permanentCreditError({ code: 'P0001', message: 'invalid_event_id' })).toBe('invalid_event');
  });

  it('lets everything else be retried', () => {
    expect(permanentCreditError(null)).toBeNull();
    expect(permanentCreditError({ code: '57014', message: 'canceling statement due to statement timeout' })).toBeNull();
    expect(permanentCreditError({ message: 'fetch failed' })).toBeNull();
  });
});

describe('purchaseEventSummary', () => {
  it('reads the identifying fields from the wrapped webhook body', () => {
    expect(
      purchaseEventSummary({ event: { ...paidPack, id: 'evt_1', app_user_id: 'not-a-uuid' } }),
    ).toEqual({
      event_id: 'evt_1',
      transaction_id: paidPack.transaction_id,
      product_id: 'pinch_credits_100',
      app_user_id: 'not-a-uuid',
      store: 'APP_STORE',
      environment: 'PRODUCTION',
    });
  });

  it('returns nulls for a body that is not an event', () => {
    expect(purchaseEventSummary('nope')).toEqual({
      event_id: null,
      transaction_id: null,
      product_id: null,
      app_user_id: null,
      store: null,
      environment: null,
    });
  });
});
