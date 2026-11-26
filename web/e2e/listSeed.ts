import { localSupabase } from "./env.mjs";
import { TEST_USER } from "./testUser";

/**
 * Shopping list data for the browser tests, in local Supabase only (env.mjs refuses anything else). Everything is
 * done as the test account itself through the normal API, so the same row-level security applies as in the apps.
 * Writing a row here is what the mobile app does, so it also stands in for "changed on the phone".
 */

export type SeedItem = { name: string; quantity?: number | null; unit?: string | null; checked?: boolean };
export type ListRow = { id: string; name: string; quantity: number | null; unit: string | null; checked: boolean };

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

/** Adds lines as the phone would. Each a second older than the next, so the list's order is known. */
export async function addListItems(items: SeedItem[]): Promise<void> {
  if (items.length === 0) return;
  const { url, userId, headers } = await asTestUser();
  const now = Date.now();
  const rows = items.map((item, index) => {
    const at = new Date(now - (items.length - index) * 1000).toISOString();
    return {
      user_id: userId,
      name: item.name,
      quantity: item.quantity ?? null,
      unit: item.unit ?? null,
      checked: item.checked ?? false,
      created_at: at,
      updated_at: at,
    };
  });
  await ok(
    await fetch(`${url}/rest/v1/shopping_list_items`, { method: "POST", headers: { ...headers, Prefer: "return=minimal" }, body: JSON.stringify(rows) }),
    "Adding list items",
  );
}

/** Empties the test account's shopping list, then fills it with `items`. */
export async function resetShoppingList(items: SeedItem[] = []): Promise<void> {
  const { url, userId, headers } = await asTestUser();
  await ok(
    await fetch(`${url}/rest/v1/shopping_list_items?user_id=eq.${userId}`, { method: "DELETE", headers: { ...headers, Prefer: "return=minimal" } }),
    "Clearing the shopping list",
  );
  await addListItems(items);
}

/** The list as saved, oldest first: what the mobile app would load. */
export async function readShoppingList(): Promise<ListRow[]> {
  const { url, headers } = await asTestUser();
  const response = await ok(
    await fetch(`${url}/rest/v1/shopping_list_items?select=id,name,quantity,unit,checked&order=created_at.asc`, { headers }),
    "Reading the shopping list",
  );
  return ((await response.json()) as ListRow[]).map((row) => ({ ...row, quantity: row.quantity == null ? null : Number(row.quantity) }));
}

/** Ticks a line as the phone would. */
export async function checkListItem(name: string, checked = true): Promise<void> {
  const { url, headers } = await asTestUser();
  await ok(
    await fetch(`${url}/rest/v1/shopping_list_items?name=eq.${encodeURIComponent(name)}`, {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({ checked, updated_at: new Date().toISOString() }),
    }),
    "Checking a list item",
  );
}

async function rpc(fn: string, args: Record<string, unknown> = {}) {
  const { url, headers } = await asTestUser();
  const response = await ok(await fetch(`${url}/rest/v1/rpc/${fn}`, { method: "POST", headers, body: JSON.stringify(args) }), `Calling ${fn}`);
  return response.json();
}

/** What the test account's household keeps at home ("Always have"; the household's since ADR 034). */
export async function readPantryStaples(): Promise<string[]> {
  const household = (await rpc("get_my_household")) as { staples: string[] | null };
  return household.staples ?? [];
}

/** Sets what the test account's household keeps at home, as the phone would. */
export async function setPantryStaples(pantryStaples: string[]): Promise<void> {
  await rpc("set_household_staples", { p_staples: pantryStaples });
}
