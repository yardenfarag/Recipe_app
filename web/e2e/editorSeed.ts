import type { Page, Route } from "@playwright/test";

import { localSupabase } from "./env.mjs";
import { TEST_USER } from "./testUser";

// A stand-in for the `save-recipe-edit` Edge Function (CI has no Edge Function runtime), for the editor tests and for
// finishing a partial import from Snap. It writes the content straight to local Supabase as the test account, the way
// the real function stores it (minus the content check and the background recalculation).

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export type SaveCall = {
  mode: string;
  recipe_id?: string;
  content?: Record<string, unknown> & { photo?: { action: string } };
  /** Import mode: where the partial import came from. */
  source?: { original_url: string | null; platform: string; extraction_source: string };
};

export async function asTestUser() {
  const { url, anonKey } = localSupabase();
  const signIn = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email: TEST_USER.email, password: TEST_USER.password }),
  });
  if (!signIn.ok) throw new Error(`Could not sign in the test user (${signIn.status})`);
  const { access_token: token, user } = await signIn.json();
  return { url, userId: user.id as string, headers: { apikey: anonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "return=representation" } };
}

/**
 * Answers `save-recipe-edit` by writing the content to the database, or with `reply` when given (a blocked save).
 * Every other Edge Function call fails, so nothing reaches a real one, unless `othersFallBack` hands them on to a stub
 * registered earlier (Snap's import stub, for finishing a partial import). Returns the requests made.
 */
export async function stubSaveRecipeEdit(page: Page, reply?: Record<string, unknown>, options: { othersFallBack?: boolean } = {}) {
  const calls: SaveCall[] = [];
  await page.route("**/functions/v1/**", async (route: Route) => {
    const request = route.request();
    const fn = new URL(request.url()).pathname.split("/functions/v1/")[1] ?? "";
    if (fn !== "save-recipe-edit" && options.othersFallBack) return route.fallback();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const json = (status: number, body: unknown) => route.fulfill({ status, headers: CORS, contentType: "application/json", body: JSON.stringify(body) });
    if (fn !== "save-recipe-edit") return json(500, { error: `${fn} is not stubbed` });
    const body = request.postDataJSON() as SaveCall & { content: Record<string, unknown> & { photo: { action: string } }; locked_fields: string[] };
    calls.push(body);
    if (reply) return json(200, reply);

    const { url, userId, headers } = await asTestUser();
    const { content } = body;
    const row: Record<string, unknown> = {
      title: content.title,
      servings: content.servings,
      ingredients: content.ingredients,
      instructions: content.instructions,
      estimated_time_minutes: content.estimated_time_minutes,
      calories: content.calories,
      effort_level: content.effort_level,
      cost_estimate: content.cost_estimate,
      tags: content.tags,
      locked_fields: body.locked_fields,
    };
    if (content.photo.action === "remove") row.image_url = null;
    const response =
      body.mode === "edit"
        ? await fetch(`${url}/rest/v1/recipes?id=eq.${body.recipe_id}`, { method: "PATCH", headers, body: JSON.stringify(row) })
        : await fetch(`${url}/rest/v1/recipes`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              ...row,
              user_id: userId,
              // A finished partial import keeps where it came from; a written recipe is the cook's own.
              extraction_source: body.source?.extraction_source ?? "manual",
              platform: body.source?.platform ?? "unknown",
              original_url: body.source?.original_url ?? null,
              source_language: "en",
              extraction_status: "full",
            }),
          });
    if (!response.ok) return json(500, { status: "failed", code: "server_error", message: await response.text() });
    const [recipe] = await response.json();
    return json(200, { status: "saved", recipe, recalculating: [], recalculation: "none" });
  });
  return calls;
}
