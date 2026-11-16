// Web credit packs sold through Polar (pinch-app.io). Polar is the merchant of record; its
// webhook tells us an order was paid, or that it was refunded.
//
// The checkout (supabase/functions/polar-checkout) sets the buyer's Supabase user id as the
// Polar customer's external id and copies user_id + pack_id into the checkout metadata, which
// Polar copies onto the order. Each Polar product also carries metadata.pack_id, the same
// pinch_credits_* id the app stores use.

export const PACK_CREDITS: Readonly<Record<string, number>> = {
  pinch_credits_10: 10,
  pinch_credits_30: 30,
  pinch_credits_100: 100,
};

/** Standard Webhooks leaves the window to the receiver; older than this is treated as a replay. */
export const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

export type PolarDecision =
  | { action: 'ignore'; reason: string }
  | { action: 'unhandled'; reason: string }
  | { action: 'grant'; orderId: string; userId: string; packId: string; credits: number; occurredAt: string | null }
  | { action: 'revoke'; orderId: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> | null {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(new ArrayBuffer(binary.length));
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function bytesToBase64(bytes: ArrayBuffer): string {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * HMAC keys a Polar secret may sign with. Standard Webhooks secrets ("whsec_<base64>", made on
 * or after 2026-09-08) sign with the decoded bytes; older Polar secrets sign with the UTF-8
 * bytes of the whole string. Trying both keeps either kind working.
 */
function candidateKeys(secret: string): Uint8Array<ArrayBuffer>[] {
  const keys: Uint8Array<ArrayBuffer>[] = [new TextEncoder().encode(secret) as Uint8Array<ArrayBuffer>];
  if (secret.startsWith('whsec_')) {
    const decoded = base64ToBytes(secret.slice('whsec_'.length));
    if (decoded && decoded.length > 0) keys.unshift(decoded);
  }
  return keys;
}

export interface WebhookHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

/**
 * Standard Webhooks check: webhook-signature holds space-separated "v1,<base64>" entries, each an
 * HMAC-SHA256 of "<webhook-id>.<webhook-timestamp>.<raw body>". Any match is enough.
 */
export async function polarSignatureValid(
  headers: WebhookHeaders,
  rawBody: string,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  const id = headers.id?.trim() ?? '';
  const ts = headers.timestamp?.trim() ?? '';
  if (!id || !ts || !headers.signature || !secret) return false;
  const timestamp = Number(ts);
  if (!Number.isInteger(timestamp) || Math.abs(nowSeconds - timestamp) > SIGNATURE_TOLERANCE_SECONDS) return false;

  const signatures = headers.signature
    .split(' ')
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith('v1,'))
    .map((entry) => entry.slice(3));
  if (signatures.length === 0) return false;

  const content = new TextEncoder().encode(`${id}.${ts}.${rawBody}`);
  for (const keyBytes of candidateKeys(secret)) {
    const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const expected = bytesToBase64(await crypto.subtle.sign('HMAC', key, content));
    if (signatures.some((signature) => constantTimeEqual(signature, expected))) return true;
  }
  return false;
}

/** What a verified Polar notification asks us to do. */
export function polarDecision(body: unknown): PolarDecision {
  const event = asRecord(body);
  const order = asRecord(event?.data);
  const type = text(event?.type);
  if (!event || !order || !type) return { action: 'unhandled', reason: 'invalid_payload' };

  if (type === 'order.paid') {
    // Subscription renewals also send order.paid; credit packs are one-time purchases.
    const billingReason = text(order.billing_reason);
    if (billingReason && billingReason !== 'purchase') return { action: 'ignore', reason: `billing_${billingReason}` };
    const orderId = text(order.id);
    if (!orderId) return { action: 'unhandled', reason: 'invalid_payload' };
    const metadata = asRecord(order.metadata);
    const userId = text(asRecord(order.customer)?.external_id) || text(metadata?.user_id);
    // Bought outside the app's checkout (for example a shared checkout link): nobody to credit.
    if (!userId || !isUuid(userId)) return { action: 'unhandled', reason: 'missing_user_id' };
    const packId = text(asRecord(asRecord(order.product)?.metadata)?.pack_id) || text(metadata?.pack_id);
    const credits = PACK_CREDITS[packId];
    if (!credits) return { action: 'unhandled', reason: 'unknown_pack' };
    return {
      action: 'grant',
      orderId,
      userId,
      packId,
      credits,
      occurredAt: text(order.created_at) || text(event.timestamp) || null,
    };
  }

  if (type === 'order.refunded') {
    // Polar sends this for full and partial refunds. Only a full refund takes the pack back.
    const status = text(order.status);
    if (status !== 'refunded') return { action: 'ignore', reason: `refund_${status || 'unknown'}` };
    const orderId = text(order.id);
    if (!orderId) return { action: 'unhandled', reason: 'invalid_payload' };
    return { action: 'revoke', orderId };
  }

  return { action: 'ignore', reason: `event_${type}` };
}

/** The identifying fields of a notification, for purchase_webhook_failures. */
export function polarEventSummary(body: unknown, eventId: string | null) {
  const event = asRecord(body);
  const order = asRecord(event?.data);
  const metadata = asRecord(order?.metadata);
  return {
    event_id: eventId || null,
    transaction_id: text(order?.id) || null,
    product_id: text(asRecord(asRecord(order?.product)?.metadata)?.pack_id) || text(metadata?.pack_id) || null,
    app_user_id: text(asRecord(order?.customer)?.external_id) || text(metadata?.user_id) || null,
    store: 'polar',
    environment: 'production',
  };
}

/** Where the buyer lands after paying: the page they started from, on a site we trust. */
export function checkoutReturnUrl(requested: unknown, fallback: string): string {
  let url: URL;
  try {
    url = new URL(text(requested) || fallback);
  } catch {
    url = new URL(fallback);
  }
  const trusted =
    (url.protocol === 'https:' && (url.hostname === 'pinch-app.io' || url.hostname === 'www.pinch-app.io')) ||
    (url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1'));
  if (!trusted) url = new URL(fallback);
  url.hash = '';
  url.search = '';
  // Polar fills {CHECKOUT_ID} in; the app sees it and refreshes the balance.
  return `${url.toString()}?checkout_id={CHECKOUT_ID}`;
}
