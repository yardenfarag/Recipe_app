import { localSupabase } from "./env.mjs";
import { TEST_USER } from "./testUser";

/**
 * The meal plan (PIN-77) for the browser tests, in local Supabase only (env.mjs refuses anything else). The plan is
 * the test account's own rows, so it is cleared and read as that account.
 */

async function asTestUser() {
  const { url, anonKey } = localSupabase();
  const signIn = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email: TEST_USER.email, password: TEST_USER.password }),
  });
  if (!signIn.ok) throw new Error(`Could not sign in the test user (${signIn.status}): ${await signIn.text()}`);
  const { access_token: token, user } = await signIn.json();
  return { url, headers: { apikey: anonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, userId: user.id as string };
}

/** Clears the test account's plan and what "Plan my week" remembers. */
export async function resetMealPlan(prefs: Record<string, unknown> = {}): Promise<void> {
  const { url, headers, userId } = await asTestUser();
  const cleared = await fetch(`${url}/rest/v1/meal_plan_entries?user_id=eq.${userId}`, { method: "DELETE", headers: { ...headers, Prefer: "return=minimal" } });
  if (!cleared.ok) throw new Error(`Could not clear the meal plan (${cleared.status}): ${await cleared.text()}`);
  const saved = await fetch(`${url}/rest/v1/profiles?id=eq.${userId}`, {
    method: "PATCH",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify({ meal_plan_prefs: prefs }),
  });
  if (!saved.ok) throw new Error(`Could not reset the plan choices (${saved.status}): ${await saved.text()}`);
}

export type PlanRow = { plan_date: string; meal: string; recipe_id: string; leftover_of: string | null; locked: boolean; servings: number };

export async function readMealPlan(): Promise<PlanRow[]> {
  const { url, headers, userId } = await asTestUser();
  const response = await fetch(`${url}/rest/v1/meal_plan_entries?user_id=eq.${userId}&select=plan_date,meal,recipe_id,leftover_of,locked,servings&order=plan_date`, { headers });
  if (!response.ok) throw new Error(`Could not read the meal plan (${response.status}): ${await response.text()}`);
  return response.json();
}
