const PRODUCT_CREDITS: Readonly<Record<string, number>> = {
  pinch_credits_10: 10,
  pinch_credits_30: 30,
  pinch_credits_100: 100,
};

const PURCHASE_TYPES = new Set(['NON_RENEWING_PURCHASE', 'INITIAL_PURCHASE']);

export interface CreditGrant {
  userId: string;
  credits: number;
  eventId: string;
  transactionId: string;
  productId: string;
  store: string | null;
  environment: string | null;
  purchasedAtMs: number | null;
}

export type CreditPurchaseDecision =
  | { action: 'ignore' }
  | { action: 'grant'; grant: CreditGrant }
  | { action: 'retry' };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function eventRecord(body: unknown): Record<string, unknown> {
  const record = asRecord(body);
  if (!record) return {};
  const nested = asRecord(record.event);
  if (nested) return nested;
  return record;
}

/**
 * Decide whether a RevenueCat webhook should grant recipe credits.
 * A known credit pack is granted from NON_RENEWING_PURCHASE, INITIAL_PURCHASE,
 * or a purchase payload that omits type. Transaction id is the idempotency key
 * when the event id is missing, so a paid pack is not acknowledged and dropped.
 */
export function creditPurchaseDecision(body: unknown): CreditPurchaseDecision {
  const event = eventRecord(body);
  const type = text(event.type);
  const productId = text(event.product_id);
  const credits = PRODUCT_CREDITS[productId];

  if (!credits) return { action: 'ignore' };
  if (type && !PURCHASE_TYPES.has(type)) return { action: 'ignore' };

  const userId = text(event.app_user_id);
  const transactionId = text(event.transaction_id) || text(event.original_transaction_id);
  const eventId = text(event.id) || transactionId;

  if (!userId || !isUuid(userId) || !transactionId || !eventId) {
    return { action: 'retry' };
  }

  const purchasedAt = event.purchased_at_ms;
  return {
    action: 'grant',
    grant: {
      userId,
      credits,
      eventId,
      transactionId,
      productId,
      store: text(event.store) || null,
      environment: text(event.environment) || null,
      purchasedAtMs: typeof purchasedAt === 'number' ? purchasedAt : null,
    },
  };
}
