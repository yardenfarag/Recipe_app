import type { Page } from "@playwright/test";

import { localSupabase } from "./env.mjs";
import { TEST_USER } from "./testUser";

/**
 * Pantry data for the browser tests (PIN-181), in local Supabase only. Written as the test account through the
 * normal API, under the same row-level security as the apps.
 */

export type SeedPantryItem = { name: string; name_en?: string; brand?: string; place: "fridge" | "freezer" | "cupboard" | "other"; aisle?: string; source?: string; last_seen_at?: string };

async function ok(response: Response, what: string) {
  if (!response.ok) throw new Error(`${what} failed (${response.status}): ${await response.text()}`);
  return response;
}

async function asTestUser() {
  const { url, anonKey } = localSupabase();
  const response = await ok(
    await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email: TEST_USER.email, password: TEST_USER.password }),
    }),
    "Signing in the test user",
  );
  const { access_token: token, user } = await response.json();
  return { url, userId: user.id as string, headers: { apikey: anonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" } };
}

/** Empties the test account's pantry and its unsaved scans, then fills the pantry with `items`. */
export async function resetPantry(items: SeedPantryItem[] = []): Promise<void> {
  const { url, userId, headers } = await asTestUser();
  for (const table of ["pantry_items", "pantry_scan_photos"]) {
    await ok(
      await fetch(`${url}/rest/v1/${table}?user_id=eq.${userId}`, { method: "DELETE", headers: { ...headers, Prefer: "return=minimal" } }),
      `Clearing ${table}`,
    );
  }
  if (items.length === 0) return;
  const rows = items.map((item) => ({
    user_id: userId,
    name: item.name,
    name_en: item.name_en ?? item.name.toLowerCase(),
    brand: item.brand ?? "",
    place: item.place,
    aisle: item.aisle ?? "other",
    source: item.source ?? "scan",
    last_seen_at: item.last_seen_at ?? new Date().toISOString(),
  }));
  await ok(
    await fetch(`${url}/rest/v1/pantry_items`, { method: "POST", headers: { ...headers, Prefer: "return=minimal" }, body: JSON.stringify(rows) }),
    "Adding pantry items",
  );
}

export type PantryRow = { name: string; name_en: string; place: string; source: string };

export async function readPantry(): Promise<PantryRow[]> {
  const { url, headers } = await asTestUser();
  const response = await ok(await fetch(`${url}/rest/v1/pantry_items?select=name,name_en,place,source&order=name.asc`, { headers }), "Reading the pantry");
  return (await response.json()) as PantryRow[];
}

/** A tiny valid PNG: the browser can decode it, so the scan screen shrinks and sends it like a real photo. */
export const PHOTO = {
  name: "shelf.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAABuUlEQVR4nAXBEQLAIBiA0R1sGIbDcBgGQRAEgyD4IQiCIAiCDvEda+9d+JtwE2/SzXeTb8qN3NSbdtNvxs28WTf75twXXhEUUZEUnyIrikIUVdEUXTEUU7EUW3HUhdcETdQkzafJmqIRTdU0TdcMzdQszdYcfeEfwkN8SA/fQ34oD/JQH9pDfxgP82E97IfzXHhDMERDMnyGbCgGMVRDM3TDMEzDMmzDMRf+JbzEl/TyveSX8iIv9aW99JfxMl/Wy34574W3BEu0JMtnyZZiEUu1NEu3DMu0LMu2HHvhHcERHcnxObKjOMRRHc3RHcMxHcuxHcdd+EAIxEAKfIEcKAEJ1EAL9MAIzMAK7MAJFz4REjGREl8iJ0pCEjXREj0xEjOxEjtx0oXPhEzMpMyXyZmSkUzNtEzPjMzMrMzOnHzhhSBEIQmfkIUiiFCFJnRhCFNYwhaOXPhGaMRGanyN3CgNadRGa/TGaMzGauzGaRd+EAZxkAbfIA/KQAZ10AZ9MAZzsAZ7cMaFX4RFXKTFt8iLspBFXbRFX4zFXKzFXpx14Q/hEA/p8B3yoRzkUA/t0A/jMA/rsA/n/KJC1hA338WrAAAAAElFTkSuQmCC",
    "base64",
  ),
};

/** Three clearly different photos, for tests that send several (identical ones are skipped as the same shot). */
export const PHOTOS = [
  { name: "shelf-1.png", mimeType: "image/png", buffer: Buffer.from("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", "base64") },
  { name: "shelf-2.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAACQAAAAgCAIAAAD1803ZAAABAUlEQVR4nLXIEdYCABCF0VnJ41lTEAQ/BEEQBEEQBEEQBEEQBEEQBEHQmRMEQUt46/jt28Gcc+mGBgUPEh0fGhY8THR8aFTwKNHxob+C/xIdHxoXPE50fGhS8CTR8aFpwdNEx4dmBc8SHR+aFzxPdHxoUfAi0fGhZcHLRMeHVgWvEh0fWhe8TnR8aFPwJtHxoW3B20THh3YF7xIdH9oXvE90fOhQ8CHR8aFjwcdEx4dOBZ8SHR86F3xOdHzoUvAl0fGha8HXRMeHbgXfEh0fuhd8T3R86FHwI9HxoWfBz0THh14FvxIdH3oX/E50fOhT8CfR8aFvwd9Ex4d+Bf8SHf8P3AwHagt/e7EAAAAASUVORK5CYII=", "base64") },
  { name: "shelf-3.png", mimeType: "image/png", buffer: Buffer.from("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", "base64") },
];

/**
 * Answers the scan-pantry function in the browser, so the tests never call a model. Each photo gets the next answer
 * in `answers` (the last one repeats), stamped with the scan and place the page sent.
 */
export async function stubScanPantry(
  page: Page,
  answers: { quality?: string; items: { name: string; name_en?: string; brand?: string; aisle?: string; confidence?: "high" | "low"; container_unknown?: boolean }[] }[],
) {
  let call = 0;
  await page.route("**/functions/v1/scan-pantry", async (route) => {
    const body = route.request().postDataJSON() as { scan_id: string; place: string };
    const answer = answers[Math.min(call, answers.length - 1)];
    call += 1;
    await route.fulfill({
      json: {
        status: "ok",
        photo: {
          id: `00000000-0000-4000-8000-${String(call).padStart(12, "0")}`,
          scan_id: body.scan_id,
          place: body.place,
          quality: answer.quality ?? "ok",
          truncated: false,
          from_phone: false,
          created_at: new Date(Date.now() + call).toISOString(),
          items: answer.items.map((item) => ({
            name: item.name,
            name_en: item.name_en ?? item.name.toLowerCase(),
            brand: item.brand ?? "",
            aisle: item.aisle ?? "other",
            confidence: item.confidence ?? "high",
            container_unknown: item.container_unknown ?? false,
          })),
        },
      },
    });
  });
}
