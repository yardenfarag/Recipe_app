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

export type SeedRecipe = {
  title: string;
  is_favorite?: boolean;
  estimated_time_minutes?: number;
  effort_level?: "Easy" | "Medium" | "Hard";
  cost_estimate?: "$" | "$$" | "$$$";
  tags?: string[];
  image_url?: string;
  /** Seconds before now, so the order of "newest first" is known. */
  createdSecondsAgo?: number;
};

/**
 * Empties the shared test account's library (recipes and collections), then fills it with `recipes`. Done as the
 * account itself, through the normal API, so the same row-level security applies as in the app.
 */
export async function resetLibrary(recipes: SeedRecipe[]) {
  const { url, anonKey } = localSupabase();
  const signIn = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email: TEST_USER.email, password: TEST_USER.password }),
  });
  if (!signIn.ok) throw new Error(`Could not sign in the test user (${signIn.status}): ${await signIn.text()}`);
  const { access_token: token, user } = await signIn.json();
  const headers = { apikey: anonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "return=minimal" };

  for (const table of ["collections", "recipes"]) {
    const response = await fetch(`${url}/rest/v1/${table}?user_id=eq.${user.id}`, { method: "DELETE", headers });
    if (!response.ok) throw new Error(`Could not clear ${table} (${response.status}): ${await response.text()}`);
  }
  if (recipes.length === 0) return;

  const now = Date.now();
  const rows = recipes.map((recipe, index) => ({
    user_id: user.id,
    title: recipe.title,
    is_favorite: recipe.is_favorite ?? false,
    estimated_time_minutes: recipe.estimated_time_minutes ?? null,
    effort_level: recipe.effort_level ?? null,
    cost_estimate: recipe.cost_estimate ?? null,
    tags: recipe.tags ?? [],
    image_url: recipe.image_url ?? null,
    ingredients: [{ name: "salt", quantity: 1, unit: "pinch" }],
    instructions: [{ step: 1, text: "Cook it." }],
    platform: "web",
    created_at: new Date(now - (recipe.createdSecondsAgo ?? index) * 1000).toISOString(),
  }));
  const insert = await fetch(`${url}/rest/v1/recipes`, { method: "POST", headers, body: JSON.stringify(rows) });
  if (!insert.ok) throw new Error(`Could not add recipes (${insert.status}): ${await insert.text()}`);
}
