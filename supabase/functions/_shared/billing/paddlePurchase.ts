// Web credit packs sold through Paddle (pinch-app.io). Paddle is the merchant of record; its
// webhook tells us a checkout was paid, or that a payment was refunded or charged back.
//
// The web checkout (src/lib/purchases.ts) passes the buyer's Supabase user id as the
// transaction's custom_data.user_id. Each Paddle product carries custom_data.pack_id, the same
// pinch_credits_* id the app stores use, which decides how many credits a line is worth.

export const PACK_CREDITS: Readonly<Record<string, number>> = {
  pinch_credits_10: 10,
  pinch_credits_30: 30,
  pinch_credits_100: 100,
};

/** Paddle signs each delivery; older than this and we treat it as a replay. */
export const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

export interface PaddleLine {
  productId: string;
  quantity: number;
  /** From the payload when Paddle includes the product; otherwise looked up by productId. */
  packId: string | null;
}

export type PaddleDecision =
  | { action: 'ignore'; reason: string }
  | { action: 'retry'; reason: string }
  | {
      action: 'grant';
      eventId: string;
      transactionId: string;
      userId: string;
      lines: PaddleLine[];
      occurredAt: string | null;
    }
  | { action: 'revoke'; eventId: string; transactionId: string; adjustmentId: string; kind: string };

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

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Checks the Paddle-Signature header ("ts=<unix seconds>;h1=<hex>"): an HMAC-SHA256 of
 * "<ts>:<raw body>" with the notification destination's secret. During a secret rotation
 * Paddle sends more than one h1, and any match is enough.
 */
export async function paddleSignatureValid(
  header: string | null,
  rawBody: string,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!header || !secret) return false;
  let ts = '';
  const signatures: string[] = [];
  for (const part of header.split(';')) {
    const [key, value] = part.split('=', 2).map((s) => s?.trim() ?? '');
    if (key === 'ts') ts = value;
    else if (key === 'h1' && value) signatures.push(value.toLowerCase());
  }
  const timestamp = Number(ts);
  if (!ts || !Number.isInteger(timestamp) || signatures.length === 0) return false;
  if (Math.abs(nowSeconds - timestamp) > SIGNATURE_TOLERANCE_SECONDS) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const expected = hex(await crypto.subtle.sign('HMAC', key, encoder.encode(`${ts}:${rawBody}`)));
  return signatures.some((signature) => constantTimeEqual(signature, expected));
}

function packIdOf(product: unknown): string | null {
  const id = text(asRecord(asRecord(product)?.custom_data)?.pack_id);
  return id || null;
}

function transactionLines(data: Record<string, unknown>): PaddleLine[] {
  // details.line_items carries the product (with custom_data); items carries price + quantity.
  const products = new Map<string, string | null>();
  const details = asRecord(data.details);
  for (const line of Array.isArray(details?.line_items) ? details.line_items : []) {
    const product = asRecord(asRecord(line)?.product);
    const id = text(product?.id);
    if (id) products.set(id, packIdOf(product));
  }

  const lines: PaddleLine[] = [];
  for (const raw of Array.isArray(data.items) ? data.items : []) {
    const item = asRecord(raw);
    const price = asRecord(item?.price);
    const productId = text(price?.product_id) || text(asRecord(item?.product)?.id);
    const quantity = Number(item?.quantity ?? 1);
    if (!productId || !Number.isInteger(quantity) || quantity < 1) continue;
    lines.push({
      productId,
      quantity,
      packId: products.get(productId) ?? packIdOf(item?.product),
    });
  }
  return lines;
}

/** What a verified Paddle notification asks us to do. */
export function paddleDecision(body: unknown): PaddleDecision {
  const event = asRecord(body);
  const data = asRecord(event?.data);
  const type = text(event?.event_type);
  const eventId = text(event?.event_id);
  if (!event || !data || !type) return { action: 'retry', reason: 'invalid_payload' };

  if (type === 'transaction.completed') {
    const transactionId = text(data.id);
    const userId = text(asRecord(data.custom_data)?.user_id);
    if (!transactionId || !eventId) return { action: 'retry', reason: 'invalid_payload' };
    // Bought outside the app's checkout (for example an invoice): nobody to credit.
    if (!userId || !isUuid(userId)) return { action: 'retry', reason: 'missing_user_id' };
    const lines = transactionLines(data);
    if (lines.length === 0) return { action: 'retry', reason: 'no_items' };
    return {
      action: 'grant',
      eventId,
      transactionId,
      userId,
      lines,
      occurredAt: text(event.occurred_at) || null,
    };
  }

  if (type === 'adjustment.created' || type === 'adjustment.updated') {
    const kind = text(data.action);
    // Refunds wait for approval; chargebacks arrive approved. Credits (store credit) and
    // chargeback warnings don't take money back.
    if (kind !== 'refund' && kind !== 'chargeback') return { action: 'ignore', reason: `adjustment_${kind}` };
    if (text(data.status) !== 'approved') return { action: 'ignore', reason: 'adjustment_not_approved' };
    const transactionId = text(data.transaction_id);
    const adjustmentId = text(data.id);
    if (!transactionId || !adjustmentId || !eventId) return { action: 'retry', reason: 'invalid_payload' };
    return { action: 'revoke', eventId, transactionId, adjustmentId, kind };
  }

  return { action: 'ignore', reason: `event_${type}` };
}

/** Total credits for a transaction, or null when a line isn't a known pack. */
export function creditsFor(lines: readonly PaddleLine[]): number | null {
  let total = 0;
  for (const line of lines) {
    const credits = line.packId ? PACK_CREDITS[line.packId] : undefined;
    if (!credits) return null;
    total += credits * line.quantity;
  }
  return total;
}

/** Live keys call api.paddle.com; sandbox keys (pdl_sdbx_…) call sandbox-api.paddle.com. */
export function paddleApiBase(apiKey: string): string {
  return apiKey.includes('_sdbx_') ? 'https://sandbox-api.paddle.com' : 'https://api.paddle.com';
}

export function paddleEnvironment(apiKey: string): 'sandbox' | 'production' {
  return apiKey.includes('_sdbx_') ? 'sandbox' : 'production';
}

/** The identifying fields of a notification, for purchase_webhook_failures. */
export function paddleEventSummary(body: unknown) {
  const event = asRecord(body);
  const data = asRecord(event?.data);
  const type = text(event?.event_type);
  const isTransaction = type.startsWith('transaction.');
  const lines = data && isTransaction ? transactionLines(data) : [];
  return {
    event_id: text(event?.event_id) || null,
    transaction_id: (isTransaction ? text(data?.id) : text(data?.transaction_id)) || null,
    product_id: lines.map((line) => line.packId ?? line.productId).join(',') || null,
    app_user_id: text(asRecord(data?.custom_data)?.user_id) || null,
    store: 'paddle',
    environment: null as string | null,
  };
}
