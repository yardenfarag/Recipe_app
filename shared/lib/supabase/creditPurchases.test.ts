import { FunctionsHttpError } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CheckoutError, purchasedCreditsSince, startCreditCheckout } from './creditPurchases';

// vi.mock is hoisted above the imports, so ./creditPurchases gets this client.
const functions = vi.hoisted(() => ({ invoke: vi.fn() }));
const query = vi.hoisted(() => {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ['select', 'eq', 'gte', 'order']) chain[method] = vi.fn(() => chain);
  chain.limit = vi.fn();
  return chain;
});
const from = vi.hoisted(() => vi.fn(() => query));
vi.mock('./client', () => ({ supabase: { functions, from } }));

function httpError(status: number, body: string) {
  return new FunctionsHttpError(new Response(body, { status }));
}

describe('web credit purchases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('asks polar-checkout for a checkout for the pack, returning to the given page', async () => {
    functions.invoke.mockResolvedValue({ data: { url: 'https://polar.sh/checkout/abc' }, error: null });
    await expect(startCreditCheckout('pinch_credits_30', 'https://pinch-app.io/app/add')).resolves.toBe(
      'https://polar.sh/checkout/abc',
    );
    expect(functions.invoke).toHaveBeenCalledWith('polar-checkout', {
      body: { pack_id: 'pinch_credits_30', return_url: 'https://pinch-app.io/app/add' },
    });
  });

  it('says when the server has web sales switched off', async () => {
    functions.invoke.mockResolvedValue({ data: null, error: httpError(503, JSON.stringify({ error: 'purchases_disabled' })) });
    await expect(startCreditCheckout('pinch_credits_10', undefined)).rejects.toMatchObject({ reason: 'sales_off' });
  });

  it('fails plainly on any other error, or an answer without a checkout address', async () => {
    functions.invoke.mockResolvedValue({ data: null, error: httpError(502, JSON.stringify({ error: 'Checkout unavailable' })) });
    await expect(startCreditCheckout('pinch_credits_10', undefined)).rejects.toMatchObject({ reason: 'unavailable' });
    functions.invoke.mockResolvedValue({ data: null, error: httpError(504, '<html>Gateway Timeout</html>') });
    await expect(startCreditCheckout('pinch_credits_10', undefined)).rejects.toBeInstanceOf(CheckoutError);
    functions.invoke.mockResolvedValue({ data: {}, error: null });
    await expect(startCreditCheckout('pinch_credits_10', undefined)).rejects.toMatchObject({ reason: 'unavailable' });
  });

  it('finds the newest pack purchase since the checkout began', async () => {
    query.limit.mockResolvedValue({ data: [{ delta: 30 }], error: null });
    await expect(purchasedCreditsSince('user-1', '2026-11-16T14:57:00.000Z')).resolves.toBe(30);
    expect(from).toHaveBeenCalledWith('token_ledger');
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(query.eq).toHaveBeenCalledWith('reason', 'recipe_credit_purchase');
    expect(query.gte).toHaveBeenCalledWith('created_at', '2026-11-16T14:57:00.000Z');

    query.limit.mockResolvedValue({ data: [], error: null });
    await expect(purchasedCreditsSince('user-1', '2026-11-16T14:57:00.000Z')).resolves.toBeNull();

    query.limit.mockResolvedValue({ data: null, error: new Error('offline') });
    await expect(purchasedCreditsSince('user-1', '2026-11-16T14:57:00.000Z')).rejects.toThrow('offline');
  });
});
