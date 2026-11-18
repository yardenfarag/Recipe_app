// Starts a Polar checkout for a web credit pack (src/lib/purchases.ts).
// POST { pack_id, return_url } with the user's JWT → { url } of Polar's hosted checkout.
//
// The signed-in user's id becomes the Polar customer's external id and goes into the checkout
// metadata, which Polar copies onto the order; polar-webhook credits that user once it's paid.
// Secret: POLAR_ACCESS_TOKEN (organization token with checkouts:write and products:read).
import { corsHeaders, jsonResponse } from '../_shared/core/cors.ts';
import { checkoutReturnUrl, PACK_CREDITS } from '../_shared/billing/polarPurchase.ts';
import { createAuthedSupabase } from '../_shared/core/recipeLookup.ts';

const POLAR_API = 'https://api.polar.sh/v1';
const DEFAULT_RETURN_URL = 'https://pinch-app.io/app/settings/credits';

// pack_id → Polar product id. Products don't change their pack, so a warm function asks once.
let productIds: Map<string, string> | null = null;

async function productIdFor(packId: string, token: string): Promise<string | null> {
  if (!productIds?.has(packId)) {
    const response = await fetch(`${POLAR_API}/products/?is_archived=false&limit=100`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`Polar product list failed: ${response.status}`);
    const items: unknown[] = (await response.json())?.items ?? [];
    productIds = new Map();
    for (const item of items) {
      const product = item as { id?: unknown; metadata?: { pack_id?: unknown } };
      if (typeof product.id === 'string' && typeof product.metadata?.pack_id === 'string') {
        productIds.set(product.metadata.pack_id, product.id);
      }
    }
  }
  return productIds.get(packId) ?? null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  if (Deno.env.get('CREDIT_PURCHASES_ENABLED') !== 'true') {
    return jsonResponse({ error: 'purchases_disabled' }, 503);
  }
  const token = Deno.env.get('POLAR_ACCESS_TOKEN');
  if (!token) return jsonResponse({ error: 'Server is not configured' }, 500);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ error: 'Missing Authorization header' }, 401);
  const authed = createAuthedSupabase(authHeader);
  if (!authed) return jsonResponse({ error: 'Server is not configured' }, 500);
  const {
    data: { user },
    error: userError,
  } = await authed.auth.getUser();
  if (userError || !user) return jsonResponse({ error: 'Unauthorized' }, 401);

  let body: { pack_id?: unknown; return_url?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }
  const packId = typeof body.pack_id === 'string' ? body.pack_id : '';
  if (!PACK_CREDITS[packId]) return jsonResponse({ error: 'Unknown credit pack' }, 400);

  let productId: string | null;
  try {
    productId = await productIdFor(packId, token);
  } catch (error) {
    console.error('[polar-checkout] product lookup failed', error);
    return jsonResponse({ error: 'Checkout unavailable' }, 502);
  }
  if (!productId) {
    console.error('[polar-checkout] no Polar product has metadata.pack_id', packId);
    return jsonResponse({ error: 'Checkout unavailable' }, 502);
  }

  // Polar should see the buyer's IP (for tax and fraud checks), not this function's.
  const buyerIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined;
  const response = await fetch(`${POLAR_API}/checkouts/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      products: [productId],
      external_customer_id: user.id,
      customer_email: user.email ?? undefined,
      customer_ip_address: buyerIp,
      metadata: { user_id: user.id, pack_id: packId },
      success_url: checkoutReturnUrl(body.return_url, DEFAULT_RETURN_URL),
    }),
  });
  if (!response.ok) {
    console.error('[polar-checkout] create failed', response.status, (await response.text()).slice(0, 500));
    return jsonResponse({ error: 'Checkout unavailable' }, 502);
  }
  const checkout = await response.json();
  if (typeof checkout?.url !== 'string') return jsonResponse({ error: 'Checkout unavailable' }, 502);
  return jsonResponse({ url: checkout.url });
});
