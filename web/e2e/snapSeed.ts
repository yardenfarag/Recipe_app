import type { Page, Route } from "@playwright/test";

/**
 * Stand-ins for the import Edge Functions, so the Snap tests never run a real import: those spend credits and call
 * paid models. Every other Edge Function call fails, so nothing slips through to a real one.
 */

export type ImportCall = { fn: string; body: Record<string, unknown> };

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Reply = { status?: number; body: Record<string, unknown> };

/**
 * Answers `extract-recipe` and `invent-recipe` with `reply` (one reply, or one per call in order, the last one
 * repeating), and records each call. Returns the calls made so far.
 */
export async function stubImports(page: Page, replies: Partial<Record<"extract-recipe" | "invent-recipe", Reply | Reply[]>>) {
  const calls: ImportCall[] = [];
  const served: Record<string, number> = {};
  await page.route("**/functions/v1/**", async (route: Route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const fn = new URL(request.url()).pathname.split("/functions/v1/")[1] ?? "";
    const planned = replies[fn as keyof typeof replies];
    if (!planned) {
      return route.fulfill({ status: 500, headers: CORS, contentType: "application/json", body: JSON.stringify({ error: `${fn} is not stubbed` }) });
    }
    const list = Array.isArray(planned) ? planned : [planned];
    const index = Math.min(served[fn] ?? 0, list.length - 1);
    served[fn] = (served[fn] ?? 0) + 1;
    calls.push({ fn, body: request.postDataJSON() as Record<string, unknown> });
    const reply = list[index];
    return route.fulfill({ status: reply.status ?? 200, headers: CORS, contentType: "application/json", body: JSON.stringify(reply.body) });
  });
  return calls;
}

/** A whole recipe as `extract-recipe` returns it (not saved: no id). */
export function importedRecipe(title: string, fields: Record<string, unknown> = {}) {
  return {
    title,
    servings: 2,
    source_language: "en",
    extraction_status: "full",
    estimated_time_minutes: 15,
    ingredients: [
      { name: "spaghetti", quantity: 200, unit: "g" },
      { name: "lemon", quantity: 1, unit: "" },
    ],
    instructions: [
      { step: 1, text: "Boil the spaghetti." },
      { step: 2, text: "Toss with lemon." },
    ],
    ...fields,
  };
}

/** One link per supported source, each with the platform the function reports. */
export const SOURCE_LINKS = [
  { platform: "youtube", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
  { platform: "instagram", url: "https://www.instagram.com/reel/C1a2b3c4d5e/" },
  { platform: "tiktok", url: "https://www.tiktok.com/@cook/video/7301234567890123456" },
  { platform: "facebook", url: "https://www.facebook.com/reel/1234567890123456" },
  { platform: "web", url: "https://www.example-recipes.com/lemon-pasta" },
] as const;

/** A small real PNG (8×8, orange), for the photo tests. The browser shrinks it to a JPEG before sending. */
export const PHOTO_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGP436GEFTEMLQkAu29qQXwjfuUAAAAASUVORK5CYII=",
  "base64",
);
