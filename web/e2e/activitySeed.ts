import { localSupabase } from "./env.mjs";
import { TEST_USER } from "./testUser";

/**
 * Reads the activity log and the product events, and writes in-app messages, in local Supabase with the service role
 * (PIN-143). Local only (env.mjs refuses anything else). The tables have no grants for the app's roles, so the tests
 * read them the way the admin pages' functions do, from the server side.
 */
function service() {
  const { url, serviceRoleKey } = localSupabase();
  const headers = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" };
  return { url, headers };
}

async function json<T>(response: Response, what: string): Promise<T> {
  const text = await response.text();
  if (!response.ok) throw new Error(`${what} failed (${response.status}): ${text}`);
  return (text ? JSON.parse(text) : null) as T;
}

/** The shared test account's id. */
export async function testUserId(): Promise<string> {
  const { url, anonKey } = localSupabase();
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email: TEST_USER.email, password: TEST_USER.password }),
  });
  const { user } = await json<{ user: { id: string } }>(response, "Signing in the test user");
  return user.id;
}

export type InteractionRow = {
  user_id: string | null;
  guest_install_id: string | null;
  session_id: string;
  kind: "screen" | "tap" | "auth";
  name: string;
  screen: string | null;
  properties: Record<string, unknown>;
  platform: string;
  app_version: string | null;
  created_at: string;
};

/** Activity rows written since `since`, for one session or one visitor/account, oldest first. */
export async function interactionEvents(filter: { since: string; sessionId?: string; userId?: string }): Promise<InteractionRow[]> {
  const { url, headers } = service();
  const query = new URLSearchParams({ select: "*", order: "occurred_at.asc", created_at: `gte.${filter.since}` });
  if (filter.sessionId) query.set("session_id", `eq.${filter.sessionId}`);
  if (filter.userId) query.set("user_id", `eq.${filter.userId}`);
  return json<InteractionRow[]>(await fetch(`${url}/rest/v1/interaction_events?${query}`, { headers }), "Reading interaction_events");
}

export type ProductEventRow = {
  user_id: string | null;
  guest_install_id: string | null;
  name: string;
  properties: Record<string, string>;
  created_at: string;
};

export async function productEvents(filter: { since: string; name?: string }): Promise<ProductEventRow[]> {
  const { url, headers } = service();
  const query = new URLSearchParams({ select: "user_id,guest_install_id,name,properties,created_at", created_at: `gte.${filter.since}` });
  if (filter.name) query.set("name", `eq.${filter.name}`);
  return json<ProductEventRow[]>(await fetch(`${url}/rest/v1/product_events?${query}`, { headers }), "Reading product_events");
}

/** Every value a row carries that could hold text, for "nothing typed, no titles, no emails" checks. */
export function rowText(rows: object[]): string {
  return JSON.stringify(rows);
}

// ---------------------------------------------------------------------------
// In-app messages

export const MESSAGE_PREFIX = "e2e-pin143-";

export type MessageRow = {
  presentation: "alert" | "sheet" | "banner" | "fullscreen";
  tone?: "info" | "success" | "warning" | "critical";
  content: Record<string, { title: string; body: string; primaryLabel?: string; secondaryLabel?: string; linkLabel?: string }>;
  primary_action?: Record<string, string> | null;
  secondary_action?: Record<string, string> | null;
  link_url?: string | null;
  dismissible?: boolean;
  required?: boolean;
  frequency?: Record<string, unknown>;
  banner_position?: "top" | "bottom" | null;
  screens?: string[];
  targeting?: Record<string, unknown>;
};

/** A live message aimed at the test account on the web only, so nothing else (or anyone else) sees it. */
export async function createMessage(label: string, row: MessageRow): Promise<string> {
  const { url, headers } = service();
  const userId = await testUserId();
  const [created] = await json<{ id: string }[]>(
    await fetch(`${url}/rest/v1/in_app_messages?select=id`, {
      method: "POST",
      headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify({
        name: `${MESSAGE_PREFIX}${label}`,
        status: "live",
        tone: "info",
        dismissible: true,
        required: false,
        frequency: { type: "once" },
        ...row,
        targeting: { userIds: [userId], platforms: ["web"], ...(row.targeting ?? {}) },
      }),
    }),
    "Creating a message",
  );
  return created.id;
}

/** Removes the messages these tests made (their receipts go with them). */
export async function deleteTestMessages(): Promise<void> {
  const { url, headers } = service();
  await json(
    await fetch(`${url}/rest/v1/in_app_messages?name=like.${encodeURIComponent(`${MESSAGE_PREFIX}*`)}`, { method: "DELETE", headers }),
    "Deleting test messages",
  );
}

export type ReceiptRow = {
  seen_count: number;
  dismissed_at: string | null;
  clicked_at: string | null;
  clicked_button: string | null;
};

/** The test account's receipt for a message, or null before anything was recorded. */
export async function receipt(messageId: string): Promise<ReceiptRow | null> {
  const { url, headers } = service();
  const userId = await testUserId();
  const rows = await json<ReceiptRow[]>(
    await fetch(
      `${url}/rest/v1/in_app_message_receipts?message_id=eq.${messageId}&user_id=eq.${userId}&select=seen_count,dismissed_at,clicked_at,clicked_button`,
      { headers },
    ),
    "Reading a receipt",
  );
  return rows[0] ?? null;
}
