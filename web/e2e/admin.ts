import { localSupabase } from "./env.mjs";
import { TEST_USER } from "./testUser";

/** Local Supabase's admin API, for setting up accounts and reading one-time codes. Local only (env.mjs). */
async function admin(path: string, body: unknown) {
  const { url, serviceRoleKey } = localSupabase();
  const response = await fetch(`${url}/auth/v1/admin/${path}`, {
    method: "POST",
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`admin/${path} failed (${response.status}): ${text}`);
  return JSON.parse(text);
}

export async function createUser(email: string, password: string, locale = "en") {
  return admin("users", { email, password, email_confirm: true, user_metadata: { locale } });
}

/**
 * A fresh 6-digit code for the address, as the sign-in or reset email would carry. Local Supabase sends its
 * default emails, which hold only a link, so the tests take the code from here instead of the inbox.
 */
export async function oneTimeCode(email: string, type: "magiclink" | "recovery"): Promise<string> {
  const data = await admin("generate_link", { type, email });
  const code = data.email_otp ?? data.properties?.email_otp;
  if (!/^\d{6}$/.test(code ?? "")) throw new Error(`No code in generate_link response: ${JSON.stringify(data)}`);
  return code;
}

export function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

/** Puts the shared test account back to English. Tests that change the language save it on the account. */
export async function resetTestUserLanguage() {
  const { url, anonKey } = localSupabase();
  const signIn = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email: TEST_USER.email, password: TEST_USER.password }),
  });
  if (!signIn.ok) throw new Error(`Could not sign in the test user (${signIn.status}): ${await signIn.text()}`);
  const { access_token: token } = await signIn.json();
  const reset = await fetch(`${url}/auth/v1/user`, {
    method: "PUT",
    headers: { apikey: anonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ data: { locale: "en" } }),
  });
  if (!reset.ok) throw new Error(`Could not reset the test user's language (${reset.status}): ${await reset.text()}`);
}
