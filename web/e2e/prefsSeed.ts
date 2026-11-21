import { localSupabase } from "./env.mjs";
import { TEST_USER } from "./testUser";

/**
 * Reads and writes an account's synced choices (PIN-154) the way the apps do: `user_metadata.prefs`
 * ({ scheme, pack, measurement }) and `user_metadata.locale`, as the account itself. Local Supabase only (env.mjs).
 */
async function signIn(email: string, password: string) {
  const { url, anonKey } = localSupabase();
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error(`Could not sign in ${email} (${response.status}): ${await response.text()}`);
  const { access_token: token } = await response.json();
  return { url, headers: { apikey: anonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" } };
}

export type AccountPrefsMetadata = { locale?: string; prefs?: Record<string, unknown> | null };

export async function readAccountPrefs(email = TEST_USER.email, password = TEST_USER.password): Promise<AccountPrefsMetadata> {
  const { url, headers } = await signIn(email, password);
  const response = await fetch(`${url}/auth/v1/user`, { headers });
  if (!response.ok) throw new Error(`Could not read the account (${response.status}): ${await response.text()}`);
  const { user_metadata: metadata } = await response.json();
  return { locale: metadata?.locale, prefs: metadata?.prefs };
}

/** What the mobile app does when the cook changes one there. Top-level keys merge; `prefs` is replaced whole. */
export async function writeAccountPrefs(data: AccountPrefsMetadata, email = TEST_USER.email, password = TEST_USER.password) {
  const { url, headers } = await signIn(email, password);
  const response = await fetch(`${url}/auth/v1/user`, { method: "PUT", headers, body: JSON.stringify({ data }) });
  if (!response.ok) throw new Error(`Could not save the account (${response.status}): ${await response.text()}`);
}

/** Puts the shared test account back to a new account's: English, no synced choices (`null` removes the key). */
export async function resetTestUserPrefs() {
  await writeAccountPrefs({ locale: "en", prefs: null });
}
