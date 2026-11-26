import { createUser, uniqueEmail } from "./admin";
import { localSupabase } from "./env.mjs";

/**
 * Households for the browser tests (ADR 034), in local Supabase only (env.mjs refuses anything else). Each test
 * makes fresh accounts, so households never leak between tests or between runs on the same machine. Everything is
 * done as the account itself through the same RPCs the apps call.
 */

export type Account = { email: string; password: string };

const PASSWORD = "pinch-e2e-123";

/** A new, confirmed account with a household of one that isn't set up. */
export async function newAccount(prefix: string, locale = "en"): Promise<Account> {
  const email = uniqueEmail(prefix);
  await createUser(email, PASSWORD, locale);
  return { email, password: PASSWORD };
}

async function ok(response: Response, what: string) {
  if (!response.ok) throw new Error(`${what} failed (${response.status}): ${await response.text()}`);
  return response;
}

async function as(account: Account) {
  const { url, anonKey } = localSupabase();
  const response = await ok(
    await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email: account.email, password: account.password }),
    }),
    `Signing in ${account.email}`,
  );
  const { access_token: token, user } = await response.json();
  return { url, userId: user.id as string, headers: { apikey: anonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" } };
}

async function rpc<T>(account: Account, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { url, headers } = await as(account);
  const response = await ok(await fetch(`${url}/rest/v1/rpc/${fn}`, { method: "POST", headers, body: JSON.stringify(args) }), fn);
  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
}

export async function setUpHousehold(account: Account, input: { name: string; avatar: string; displayName: string }) {
  await rpc(account, "set_up_household", { p_name: input.name, p_avatar: input.avatar, p_display_name: input.displayName });
}

/** The household's live invite token (made if there is none). */
export async function inviteToken(account: Account): Promise<string> {
  return (await rpc<{ token: string }>(account, "get_household_invite")).token;
}

export async function joinHousehold(account: Account, token: string, displayName: string) {
  await rpc(account, "accept_household_invite", { p_token: token, p_display_name: displayName });
}

/** A household with these people in it, the first one having set it up. Returns the live invite token. */
export async function householdOf(name: string, people: { account: Account; displayName: string }[]): Promise<string> {
  const [first, ...rest] = people;
  await setUpHousehold(first.account, { name, avatar: "house:soup", displayName: first.displayName });
  const token = await inviteToken(first.account);
  for (const person of rest) await joinHousehold(person.account, token, person.displayName);
  return token;
}

/** Gives this person a food avatar as their profile picture (`food:<id>`), as choosing one in Settings does. */
export async function setFoodAvatar(account: Account, id: string): Promise<void> {
  const { url, userId, headers } = await as(account);
  await ok(
    await fetch(`${url}/rest/v1/profiles?id=eq.${userId}`, {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({ avatar_url: `food:${id}` }),
    }),
    "Choosing a food avatar",
  );
}

export async function membersOf(account: Account): Promise<string[]> {
  const household = await rpc<{ members: { display_name: string }[] | null }>(account, "get_my_household");
  return (household.members ?? []).map((member) => member.display_name);
}

/** Puts lines on the household's list as this person, as their phone would ("Added by" them for the others). */
export async function addListItemsAs(account: Account, names: string[]): Promise<void> {
  const household = await rpc<{ id: string }>(account, "get_my_household");
  const { url, userId, headers } = await as(account);
  const now = Date.now();
  const rows = names.map((name, index) => {
    const at = new Date(now - (names.length - index) * 1000).toISOString();
    return { household_id: household.id, user_id: userId, name, quantity: null, unit: null, checked: false, created_at: at, updated_at: at };
  });
  await ok(
    await fetch(`${url}/rest/v1/shopping_list_items`, { method: "POST", headers: { ...headers, Prefer: "return=minimal" }, body: JSON.stringify(rows) }),
    "Adding list items",
  );
}
