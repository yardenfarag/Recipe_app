import { createUser, uniqueEmail } from "./admin";
import { localSupabase } from "./env.mjs";

/**
 * Accounts for the admin pages' browser tests (PIN-144), in local Supabase only (env.mjs refuses anything else): an
 * admin and an ordinary account, both new, so the shared test account never becomes an admin. The admin flag is set
 * with the service role, as it is in production (nobody can set it on their own profile).
 */

const PASSWORD = "admin-pages-e2e-password";

export type SeedUser = { id: string; email: string; password: string };
export type AdminPagesUsers = { admin: SeedUser; member: SeedUser };

function serviceHeaders() {
  const { serviceRoleKey } = localSupabase();
  return { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" };
}

async function ok(response: Response, what: string) {
  if (!response.ok) throw new Error(`${what} failed (${response.status}): ${await response.text()}`);
  return response;
}

async function newUser(prefix: string): Promise<SeedUser> {
  const email = uniqueEmail(prefix);
  const { id } = await createUser(email, PASSWORD);
  return { id, email, password: PASSWORD };
}

export async function setAdmin(userId: string, isAdmin: boolean): Promise<void> {
  const { url } = localSupabase();
  await ok(
    await fetch(`${url}/rest/v1/profiles?id=eq.${userId}`, {
      method: "PATCH",
      headers: { ...serviceHeaders(), Prefer: "return=minimal" },
      body: JSON.stringify({ is_admin: isAdmin }),
    }),
    "Setting the admin flag",
  );
}

export async function createAdminPagesUsers(): Promise<AdminPagesUsers> {
  const admin = await newUser("admin-pages-admin");
  const member = await newUser("admin-pages-member");
  await setAdmin(admin.id, true);
  return { admin, member };
}

/** Deletes both accounts (and with them the admin flag), so admins don't pile up in local Supabase. */
export async function deleteAdminPagesUsers(users: AdminPagesUsers | undefined): Promise<void> {
  if (!users) return;
  const { url } = localSupabase();
  for (const user of [users.admin, users.member]) {
    await fetch(`${url}/auth/v1/admin/users/${user.id}`, { method: "DELETE", headers: serviceHeaders() });
  }
}

/** An access token for the account, as the browser holds after signing in. */
export async function accessToken(user: SeedUser): Promise<string> {
  const { url, anonKey } = localSupabase();
  const response = await ok(
    await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, password: user.password }),
    }),
    `Signing in ${user.email}`,
  );
  return ((await response.json()) as { access_token: string }).access_token;
}

/** Calls a database function as the account, through the same API and rules the app uses. */
export async function rpcAs(token: string, name: string, args: Record<string, unknown> = {}) {
  const { url, anonKey } = localSupabase();
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: anonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // Not JSON: keep the text.
  }
  return { status: response.status, body };
}

/** Reads a table as the account (row rules apply). */
export async function selectAs(token: string, path: string): Promise<{ status: number; rows: unknown[] }> {
  const { url, anonKey } = localSupabase();
  const response = await fetch(`${url}/rest/v1/${path}`, { headers: { apikey: anonKey, Authorization: `Bearer ${token}` } });
  const rows = response.ok ? ((await response.json()) as unknown[]) : [];
  return { status: response.status, rows };
}

/** The account's purchased credits, read with the service role. */
export async function purchasedCredits(userId: string): Promise<number> {
  const { url } = localSupabase();
  const response = await ok(await fetch(`${url}/rest/v1/profiles?id=eq.${userId}&select=token_balance`, { headers: serviceHeaders() }), "Reading credits");
  const [row] = (await response.json()) as { token_balance: number }[];
  return Number(row?.token_balance ?? 0);
}

/** Every admin-only database function the admin pages call, with arguments that would work for an admin. */
export function adminCalls(otherUserId: string): { name: string; args: Record<string, unknown> }[] {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  return [
    { name: "admin_dashboard", args: { p_days: 30, p_tz: "UTC", p_include_admins: false } },
    { name: "admin_dashboard_insights", args: { p_days: 30, p_tz: "UTC", p_include_admins: false } },
    { name: "admin_user_detail", args: { p_user_id: otherUserId } },
    { name: "admin_credit_health", args: {} },
    { name: "admin_grant_recipe_credits", args: { p_user_id: otherUserId, p_amount: 5, p_reason: "support_adjustment" } },
    { name: "admin_delete_user", args: { p_user_id: otherUserId } },
    { name: "admin_interaction_sessions", args: { p_since: since, p_search: null, p_limit: 100 } },
    { name: "admin_interaction_top", args: { p_since: since, p_limit: 40 } },
    { name: "admin_interaction_session_events", args: { p_session_id: crypto.randomUUID() } },
    { name: "admin_list_in_app_messages", args: {} },
    { name: "admin_set_in_app_message_status", args: { p_id: crypto.randomUUID(), p_status: "live" } },
    { name: "admin_delete_in_app_message", args: { p_id: crypto.randomUUID() } },
    {
      name: "admin_save_in_app_message",
      args: { p_message: { name: "Not allowed", presentation: "sheet", tone: "info", content: { en: { title: "x", body: "" } } } },
    },
  ];
}
