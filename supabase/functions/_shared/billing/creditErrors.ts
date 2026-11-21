// Which failures of grant_purchased_credits / revoke_purchased_credits a webhook retry can fix.
//
// Payment providers retry every non-2xx answer, and Polar switches the whole endpoint off after
// 10 failures in a row. One event that can never succeed (its buyer deleted the account) must
// therefore be accepted and recorded, or it stops credits for every other buyer.

export interface DbError {
  code?: string | null;
  message?: string | null;
  details?: string | null;
}

/** Why the grant or revoke can never succeed, or null when a retry may work. */
export function permanentCreditError(error: DbError | null | undefined): string | null {
  if (!error) return null;
  const message = (error.message ?? '').toLowerCase();
  // The buyer's profile is gone: a foreign key violation on the grant row, or the balance update.
  if (error.code === '23503' || message.includes('profile_not_found')) return 'account_deleted';
  // The refund for this purchase arrived first (purchase_refund_markers).
  if (message.includes('purchase_refunded')) return 'refunded_before_grant';
  if (/invalid_(amount|provider|event_id|transaction_id|product_id)/.test(message)) return 'invalid_event';
  return null;
}
