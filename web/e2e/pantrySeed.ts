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
