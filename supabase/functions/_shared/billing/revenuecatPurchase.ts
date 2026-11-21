const PRODUCT_CREDITS: Readonly<Record<string, number>> = {
  pinch_credits_10: 10,
  pinch_credits_30: 30,
  pinch_credits_100: 100,
};

const PURCHASE_TYPES = new Set(['NON_RENEWING_PURCHASE', 'INITIAL_PURCHASE']);

/**
 * RevenueCat reports an App Store or Play refund of a one-time purchase as CANCELLATION. A credit
 * pack can't be "unsubscribed", so for a pack every CANCELLATION is money going back.
 */
const REFUND_TYPE = 'CANCELLATION';

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

export interface CreditRevoke {
  /** The buyer when the event names one; the refund is matched by transaction, not by user. */
  userId: string | null;
  eventId: string;
  /** Ids the purchase may have been granted under, most likely first. */
  transactionIds: string[];
  productId: string;
  store: string | null;
  environment: string | null;
}

export type CreditPurchaseDecision =
  | { action: 'ignore' }
  | { action: 'grant'; grant: CreditGrant }
  | { action: 'revoke'; revoke: CreditRevoke }
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
 * The Pinch account an event belongs to. The app logs RevenueCat in with the Supabase user id,
 * but a purchase made before that finished arrives under `$RCAnonymousID:…`, with the account
 * id only in `original_app_user_id` or `aliases`.
 */
export function purchaseUserId(event: Record<string, unknown>): string | null {
  const aliases = Array.isArray(event.aliases) ? event.aliases : [];
  const candidates = [event.app_user_id, event.original_app_user_id, ...aliases].map(text);
  return candidates.find(isUuid) ?? null;
}

/** TestFlight, Play licence testers and StoreKit test purchases: nobody paid. */
export function isSandboxEnvironment(environment: string | null): boolean {
  return (environment ?? '').toUpperCase() === 'SANDBOX';
}

export interface PurchaseEventSummary {
  event_id: string | null;
  transaction_id: string | null;
  product_id: string | null;
  app_user_id: string | null;
  store: string | null;
  environment: string | null;
}

/** The identifying fields of a webhook body, for recording a failed delivery. */
export function purchaseEventSummary(body: unknown): PurchaseEventSummary {
  const event = eventRecord(body);
  return {
    event_id: text(event.id) || null,
    transaction_id: text(event.transaction_id) || text(event.original_transaction_id) || null,
    product_id: text(event.product_id) || null,
    // The account id when one is known, so deleting the account erases the row.
    app_user_id: purchaseUserId(event) ?? (text(event.app_user_id) || null),
    store: text(event.store) || null,
    environment: text(event.environment) || null,
  };
}

/**
 * Decide what a RevenueCat webhook means for recipe credits.
 * A known credit pack is granted from NON_RENEWING_PURCHASE, INITIAL_PURCHASE,
 * or a purchase payload that omits type, and taken back on CANCELLATION (a refund).
 * Transaction id is the idempotency key when the event id is missing, so a paid
 * pack is not acknowledged and dropped.
 */
export function creditPurchaseDecision(body: unknown): CreditPurchaseDecision {
  const event = eventRecord(body);
  const type = text(event.type);
  const productId = text(event.product_id);
  const credits = PRODUCT_CREDITS[productId];

  if (!credits) return { action: 'ignore' };

  const userId = purchaseUserId(event);
  const transactionId = text(event.transaction_id) || text(event.original_transaction_id);
  const eventId = text(event.id) || transactionId;
  const store = text(event.store) || null;
  const environment = text(event.environment) || null;

  if (type === REFUND_TYPE) {
    const transactionIds = [...new Set([text(event.transaction_id), text(event.original_transaction_id)])].filter(Boolean);
    if (transactionIds.length === 0 || !eventId) return { action: 'retry' };
    return { action: 'revoke', revoke: { userId, eventId, transactionIds, productId, store, environment } };
  }

  if (type && !PURCHASE_TYPES.has(type)) return { action: 'ignore' };

  if (!userId || !transactionId || !eventId) {
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
      store,
      environment,
      purchasedAtMs: typeof purchasedAt === 'number' ? purchasedAt : null,
    },
  };
}
