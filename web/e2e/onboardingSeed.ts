import { localSupabase } from "./env.mjs";

/**
 * Reads and writes what first-run onboarding (PIN-140) keeps on an account, the way the apps do, as the account
 * itself: `user_metadata.onboarded_at` and `profiles.kitchen`. Local Supabase only (env.mjs).
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
  return { url, userId: user.id as string, headers: { apikey: anonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" } };
}

export type OnboardingAccount = {
  metadata: Record<string, unknown>;
  kitchen: { diets?: string[]; allergies?: string[]; dislikes?: string[]; allergyNoticeAcceptedAt?: string; autoApplyOnExtract?: boolean } | null;
};

export async function readOnboardingAccount(email: string, password: string): Promise<OnboardingAccount> {
  const { url, userId, headers } = await signIn(email, password);
  const user = await fetch(`${url}/auth/v1/user`, { headers });
  if (!user.ok) throw new Error(`Could not read the account (${user.status}): ${await user.text()}`);
  const { user_metadata: metadata } = await user.json();
  const profile = await fetch(`${url}/rest/v1/profiles?id=eq.${userId}&select=kitchen`, { headers });
  if (!profile.ok) throw new Error(`Could not read the profile (${profile.status}): ${await profile.text()}`);
  const [row] = (await profile.json()) as { kitchen: OnboardingAccount["kitchen"] }[];
  return { metadata: metadata ?? {}, kitchen: row?.kitchen ?? null };
}

/** What the mobile app saves once its onboarding is done (src/hooks/useOnboardingGate.tsx). */
export async function markOnboardedElsewhere(email: string, password: string) {
  const { url, headers } = await signIn(email, password);
  const response = await fetch(`${url}/auth/v1/user`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ data: { onboarded_at: new Date().toISOString() } }),
  });
  if (!response.ok) throw new Error(`Could not save the account (${response.status}): ${await response.text()}`);
}
