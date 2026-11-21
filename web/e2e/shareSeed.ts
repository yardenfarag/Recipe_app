import type { Page, Route } from "@playwright/test";

import { localSupabase } from "./env.mjs";
import { signInTestUser } from "./hubSeed";

/**
 * Shared-recipe links for the browser tests, in local Supabase only (env.mjs refuses anything else). Share rows are
 * written by the `recipe-share` Edge Function alone (no client policies), so they are seeded with the service role.
 * Every seeded token starts with "e2e-share-", so the tests can clear exactly their own.
 *
 * CI runs without the Edge Functions runtime, so `stubRecipeShare` answers the function's `get` and `claim` from the
 * seeded rows, the way supabase/functions/recipe-share does.
 */

const TOKEN_PREFIX = "e2e-share-";

export type SeededShare = { token: string; title: string; original_url: string };

function serviceHeaders() {
  const { serviceRoleKey } = localSupabase();
  return { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" };
}

async function ok(response: Response, what: string) {
  if (!response.ok) throw new Error(`${what} failed (${response.status}): ${await response.text()}`);
  return response;
}

/** The recipe as a share stores it: a snapshot, not a live row. */
function snapshot(title: string, originalUrl: string) {
  return {
    title,
    original_url: originalUrl,
    platform: "web",
    ingredients: [
      { name: "lentils", quantity: 1, unit: "cup" },
      { name: "water", quantity: 3, unit: "cup" },
    ],
    instructions: [
      { step: 1, text: "Rinse the lentils." },
      { step: 2, text: "Simmer until soft." },
    ],
    servings: 2,
    estimated_time_minutes: 30,
    effort_level: "Easy",
    extraction_status: "full",
    tags: [],
    source_language: "en",
  };
}

/** Removes every share an earlier run seeded (their claims go with them), then adds one per title, shared by the test account. */
export async function resetShares(titles: string[], options: { revoked?: boolean } = {}): Promise<SeededShare[]> {
  const { url } = localSupabase();
  await ok(
    await fetch(`${url}/rest/v1/recipe_shares?token=like.${encodeURIComponent(`${TOKEN_PREFIX}*`)}`, {
      method: "DELETE",
      headers: { ...serviceHeaders(), Prefer: "return=minimal" },
    }),
    "Clearing seeded shares",
  );
  if (titles.length === 0) return [];

  const { id: sharer } = await signInTestUser();
  const shares = titles.map((title) => {
    const path = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    return {
      token: `${TOKEN_PREFIX}${path}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
      title,
      original_url: `https://e2e-share.example/${path}`,
    };
  });
  await ok(
    await fetch(`${url}/rest/v1/recipe_shares`, {
      method: "POST",
      headers: { ...serviceHeaders(), Prefer: "return=minimal" },
      body: JSON.stringify(
        shares.map((share) => ({
          token: share.token,
          created_by: sharer,
          snapshot: snapshot(share.title, share.original_url),
          revoked_at: options.revoked ? new Date().toISOString() : null,
        })),
      ),
    }),
    "Adding shares",
  );
  return shares;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function shareRow(token: string) {
  const { url } = localSupabase();
  const response = await ok(
    await fetch(`${url}/rest/v1/recipe_shares?token=eq.${encodeURIComponent(token)}&select=token,snapshot,revoked_at`, {
      headers: serviceHeaders(),
    }),
    "Reading a share",
  );
  const [row] = (await response.json()) as { token: string; snapshot: Record<string, unknown>; revoked_at: string | null }[];
  return row && !row.revoked_at ? row : null;
}

/** Copies the share into the caller's library once, as the function's `claim` does. */
async function claim(token: string, authorization: string): Promise<{ recipe_id: string; already_claimed: boolean } | null> {
  const { url, anonKey } = localSupabase();
  const share = await shareRow(token);
  if (!share) return null;
  const who = await ok(await fetch(`${url}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: authorization } }), "Reading the caller");
  const { id: userId } = (await who.json()) as { id: string };

  const prior = await ok(
    await fetch(`${url}/rest/v1/recipe_share_claims?token=eq.${encodeURIComponent(token)}&claimed_by=eq.${userId}&select=recipe_id`, {
      headers: serviceHeaders(),
    }),
    "Reading claims",
  );
  const [previous] = (await prior.json()) as { recipe_id: string }[];
  if (previous) return { recipe_id: previous.recipe_id, already_claimed: true };

  const inserted = await ok(
    await fetch(`${url}/rest/v1/recipes?select=id`, {
      method: "POST",
      headers: { ...serviceHeaders(), Prefer: "return=representation" },
      body: JSON.stringify({ ...share.snapshot, user_id: userId, is_favorite: false, migrated_from_guest: false }),
    }),
    "Saving the shared recipe",
  );
  const [{ id }] = (await inserted.json()) as { id: string }[];
  await ok(
    await fetch(`${url}/rest/v1/recipe_share_claims`, {
      method: "POST",
      headers: { ...serviceHeaders(), Prefer: "return=minimal" },
      body: JSON.stringify({ token, claimed_by: userId, recipe_id: id }),
    }),
    "Recording the claim",
  );
  return { recipe_id: id, already_claimed: false };
}

/** Answers the `recipe-share` Edge Function from local Supabase, and records each action called. */
export async function stubRecipeShare(page: Page) {
  const calls: string[] = [];
  await page.route("**/functions/v1/recipe-share", async (route: Route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const reply = (status: number, body: unknown) =>
      route.fulfill({ status, headers: CORS, contentType: "application/json", body: JSON.stringify(body) });
    const { action, token } = request.postDataJSON() as { action?: string; token?: string };
    calls.push(action ?? "");
    const notFound = { error: "Share not found", code: "share_not_found" };

    if (action === "get") {
      const share = await shareRow(token ?? "");
      return share ? reply(200, { status: "ok", token: share.token, recipe: share.snapshot }) : reply(404, notFound);
    }
    if (action === "claim") {
      const authorization = request.headers()["authorization"];
      if (!authorization) return reply(401, { error: "Missing Authorization header" });
      try {
        const claimed = await claim(token ?? "", authorization);
        return claimed ? reply(200, { status: "ok", ...claimed }) : reply(404, notFound);
      } catch (error) {
        // Answer anyway, so a failing stub fails the test with its reason instead of hanging the page.
        console.error("[recipe-share stub]", error);
        return reply(500, { error: String(error) });
      }
    }
    return reply(400, { error: `${action} is not stubbed` });
  });
  return calls;
}
