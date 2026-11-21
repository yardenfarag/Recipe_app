// Deleting an account also deletes the buyer's record at the payment providers (GDPR erasure).
// Both use the Supabase user id as the customer id: Polar as the customer's external id
// (polar-checkout), RevenueCat as the app user id (the app logs in with it).
//
// Best effort: a provider being down, or a missing secret, never blocks deleting the account.
// Secrets: POLAR_ACCESS_TOKEN (needs the customers:write scope for this call) and
// REVENUECAT_REST_API_KEY (a RevenueCat v1 secret key).

const TIMEOUT_MS = 8_000;

export type CustomerDeletion = 'deleted' | 'not_found' | 'skipped' | 'failed';

export interface PaymentCustomerDeletions {
  polar: CustomerDeletion;
  revenuecat: CustomerDeletion;
}

async function deleteAt(
  provider: string,
  url: string,
  token: string | undefined,
  fetchImpl: typeof fetch,
): Promise<CustomerDeletion> {
  if (!token) return 'skipped';
  try {
    const response = await fetchImpl(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    await response.body?.cancel();
    if (response.ok) return 'deleted';
    // Never bought anything there, or already deleted.
    if (response.status === 404) return 'not_found';
    console.error(`[delete-account] ${provider} customer delete failed`, response.status);
    return 'failed';
  } catch (err) {
    console.error(`[delete-account] ${provider} customer delete failed`, err instanceof Error ? err.message : err);
    return 'failed';
  }
}

/** Never throws. */
export async function deletePaymentCustomers(
  userId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PaymentCustomerDeletions> {
  const id = encodeURIComponent(userId);
  const [polar, revenuecat] = await Promise.all([
    // anonymize=true also clears the name and email Polar keeps on past orders.
    deleteAt(
      'polar',
      `https://api.polar.sh/v1/customers/external/${id}?anonymize=true`,
      Deno.env.get('POLAR_ACCESS_TOKEN'),
      fetchImpl,
    ),
    deleteAt(
      'revenuecat',
      `https://api.revenuecat.com/v1/subscribers/${id}`,
      Deno.env.get('REVENUECAT_REST_API_KEY'),
      fetchImpl,
    ),
  ]);
  return { polar, revenuecat };
}
