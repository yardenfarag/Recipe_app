import { localSupabase } from "./env.mjs";
import { TEST_USER } from "./testUser";

/**
 * Reads and writes an account's settings the way the mobile app does: straight on its `profiles` row, as the account
 * itself (the same row-level security as the apps). Local Supabase only (env.mjs).
 */
async function signIn(email: string, password: string) {
  const { url, anonKey } = localSupabase();
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error(`Could not sign in ${email} (${response.status}): ${await response.text()}`);
  const { access_token: token, user } = await response.json();
  const headers = { apikey: anonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  return { url, headers, userId: user.id as string };
}

export type ProfileSettings = { kitchen: Record<string, unknown> | null; contribute_to_hub: boolean };

export async function readProfileSettings(email = TEST_USER.email, password = TEST_USER.password): Promise<ProfileSettings> {
  const { url, headers, userId } = await signIn(email, password);
  const response = await fetch(`${url}/rest/v1/profiles?id=eq.${userId}&select=kitchen,contribute_to_hub`, { headers });
  if (!response.ok) throw new Error(`Could not read the profile (${response.status}): ${await response.text()}`);
  const [row] = (await response.json()) as ProfileSettings[];
  return row;
}

/** What the mobile app does when the cook changes a setting there. */
export async function writeProfileSettings(settings: Partial<ProfileSettings>, email = TEST_USER.email, password = TEST_USER.password) {
  const { url, headers, userId } = await signIn(email, password);
  const response = await fetch(`${url}/rest/v1/profiles?id=eq.${userId}`, {
    method: "PATCH",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify(settings),
  });
  if (!response.ok) throw new Error(`Could not save the profile (${response.status}): ${await response.text()}`);
}

/** Puts the shared test account's kitchen and Hub choice back to a new account's. */
export async function resetTestUserSettings() {
  await writeProfileSettings({ kitchen: {}, contribute_to_hub: true });
}

/** Whether the address and password still sign in (false once the account is deleted). */
export async function canSignIn(email: string, password: string): Promise<boolean> {
  try {
    await signIn(email, password);
    return true;
  } catch {
    return false;
  }
}
