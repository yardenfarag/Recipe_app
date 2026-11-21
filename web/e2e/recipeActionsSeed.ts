import type { Page, Route } from "@playwright/test";

/**
 * Stand-ins for the Edge Functions the recipe actions call (swap, remix, translate, repair, share), so the tests never
 * reach a paid model or spend a credit. CI runs without the edge runtime, so every function is answered here; one
 * without a handler fails, so nothing slips through to a real one.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export type FunctionCall = { fn: string; body: Record<string, unknown> };
type Reply = { status?: number; body: Record<string, unknown> };
export type Handler = (body: Record<string, unknown>) => Reply;

/** Answers each named function with its handler and records the calls. Returns the calls made so far. */
export async function stubFunctions(page: Page, handlers: Record<string, Handler>) {
  const calls: FunctionCall[] = [];
  await page.route("**/functions/v1/**", async (route: Route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const fn = new URL(request.url()).pathname.split("/functions/v1/")[1] ?? "";
    const handler = handlers[fn];
    const body = (request.postDataJSON() ?? {}) as Record<string, unknown>;
    if (!handler) {
      return route.fulfill({ status: 500, headers: CORS, contentType: "application/json", body: JSON.stringify({ error: `${fn} is not stubbed` }) });
    }
    calls.push({ fn, body });
    const reply = handler(body);
    return route.fulfill({ status: reply.status ?? 200, headers: CORS, contentType: "application/json", body: JSON.stringify(reply.body) });
  });
  return calls;
}

/** `suggest-substitution`: one alternative, then steps rewritten to use it. */
export function swapHandler(alternative: { name: string; quantity: number; unit: string; reason: string }, rewrittenSteps: { step: number; text: string }[]): Handler {
  return (body) =>
    body.mode === "rewrite_instructions"
      ? { body: { status: "ok", instructions: rewrittenSteps } }
      : { body: { status: "ok", alternatives: [alternative] } };
}

/** `transform-recipe`: the same result for every remix. */
export function remixHandler(recipe: Record<string, unknown>): Handler {
  return () => ({ body: { status: "ok", recipe } });
}

/** `translate-recipe`: the same translation whatever the language. */
export function translateHandler(recipe: Record<string, unknown>): Handler {
  return () => ({ body: { status: "ok", recipe } });
}

/** `repair-recipe`: a found repair that holds a credit, then the repaired recipe on commit. */
export function repairHandler(repaired: Record<string, unknown>, summary: string): Handler {
  return (body) => {
    if (body.action === "commit") return { body: { status: "ok", recipe: repaired } };
    if (body.action === "abort") return { body: { status: "ok" } };
    return { body: { status: "ok", summary, reservation_id: "res-1", sealed_recipe: "sealed" } };
  };
}
