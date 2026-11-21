import type { Page, Route } from "@playwright/test";

import { createUser, uniqueEmail } from "./admin";
import { localSupabase } from "./env.mjs";

/**
 * Credits for the browser tests, in local Supabase only (env.mjs refuses anything else). Nothing here touches Polar:
 * polar-checkout is answered by a stub, Polar's checkout page is a stand-in on a made-up host, and a paid order is
 * written the way polar-webhook writes it (`grant_purchased_credits`, service role).
 */

const PASSWORD = "credits-e2e-password";

/** Where the stubbed polar-checkout sends the buyer. Not a real host; the tests answer it themselves. */
export const FAKE_POLAR_CHECKOUT = "https://checkout.polar.test/e2e";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function serviceHeaders() {
  const { serviceRoleKey } = localSupabase();
  return { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" };
}

async function ok(response: Response, what: string) {
  if (!response.ok) throw new Error(`${what} failed (${response.status}): ${await response.text()}`);
  return response;
}

function yearMonthUtc(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export type CreditsUser = { id: string; email: string; password: string };

/**
 * A new account with `purchased` bought credits and `freeUsed` of this month's 10 free ones spent. Each test gets
 * its own, so balances never leak into the shared test account the other specs use.
 */
export async function createCreditsUser({ purchased = 0, freeUsed = 0, locale = "en" } = {}): Promise<CreditsUser> {
  const email = uniqueEmail("credits");
  const { id } = await createUser(email, PASSWORD, locale);
  const { url } = localSupabase();
  await ok(
    await fetch(`${url}/rest/v1/profiles?id=eq.${id}`, {
      method: "PATCH",
      headers: { ...serviceHeaders(), Prefer: "return=minimal" },
      body: JSON.stringify({ token_balance: purchased }),
    }),
    "Setting bought credits",
  );
  if (freeUsed > 0) {
    await ok(
      await fetch(`${url}/rest/v1/extract_usage_monthly`, {
        method: "POST",
        headers: { ...serviceHeaders(), Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ user_id: id, year_month: yearMonthUtc(), extract_count: freeUsed }),
      }),
      "Spending free credits",
    );
  }
  return { id, email, password: PASSWORD };
}

/** What polar-webhook does when Polar says an order is paid: adds the pack and writes the ledger row. */
export async function grantPolarPurchase(userId: string, credits: number, packId = `pinch_credits_${credits}`) {
  const { url } = localSupabase();
  const order = `e2e_order_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const response = await ok(
    await fetch(`${url}/rest/v1/rpc/grant_purchased_credits`, {
      method: "POST",
      headers: serviceHeaders(),
      body: JSON.stringify({
        p_user_id: userId,
        p_amount: credits,
        p_provider: "polar",
        p_event_id: `${order}_event`,
        p_transaction_id: order,
        p_product_id: packId,
        p_metadata: { store: "polar", e2e: true },
      }),
    }),
    "Granting a Polar purchase",
  );
  return Number(await response.json());
}

/** The account's bought credits, as the mobile app would read them. */
export async function purchasedCredits(userId: string): Promise<number> {
  const { url } = localSupabase();
  const response = await ok(
    await fetch(`${url}/rest/v1/profiles?id=eq.${userId}&select=token_balance`, { headers: serviceHeaders() }),
    "Reading bought credits",
  );
  const [row] = (await response.json()) as { token_balance: number }[];
  return row.token_balance;
}

type CheckoutReply = { status?: number; body: Record<string, unknown> };

/**
 * Answers polar-checkout with `reply` (by default, a checkout on FAKE_POLAR_CHECKOUT) and records each request body.
 * Every other Edge Function fails, so nothing reaches a real one. Polar's checkout page itself is a plain stand-in.
 */
export async function stubCheckout(page: Page, reply: CheckoutReply = { body: { url: FAKE_POLAR_CHECKOUT } }) {
  const calls: Record<string, unknown>[] = [];
  await page.route("**/functions/v1/**", async (route: Route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const fn = new URL(request.url()).pathname.split("/functions/v1/")[1] ?? "";
    if (fn !== "polar-checkout") {
      return route.fulfill({ status: 500, headers: CORS, contentType: "application/json", body: JSON.stringify({ error: `${fn} is not stubbed` }) });
    }
    calls.push(request.postDataJSON() as Record<string, unknown>);
    return route.fulfill({ status: reply.status ?? 200, headers: CORS, contentType: "application/json", body: JSON.stringify(reply.body) });
  });
  await page.route(`${FAKE_POLAR_CHECKOUT}**`, (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>Polar checkout (stand-in)</title><h1>Pay with Polar</h1>" }),
  );
  return calls;
}
