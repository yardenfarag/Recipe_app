import { localSupabase } from "./env.mjs";
import { signInTestUser } from "./hubSeed";

/**
 * Cook-along data for the browser tests (local Supabase only). `resetLibrary` (admin.ts) seeds every recipe as a
 * web page without step times; this gives a seeded recipe its source video and timed steps, through the normal
 * API as the test account.
 */
export type RecipeVideoSeed = {
  platform: "youtube" | "instagram" | "tiktok" | "facebook" | "web";
  original_url: string;
  source_video_url?: string | null;
  instructions?: { step: number; text: string; timestamp_seconds?: number }[];
};

export async function setRecipeVideo(recipeId: string, video: RecipeVideoSeed): Promise<void> {
  const { url, anonKey } = localSupabase();
  const { token } = await signInTestUser();
  const response = await fetch(`${url}/rest/v1/recipes?id=eq.${recipeId}`, {
    method: "PATCH",
    headers: { apikey: anonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(video),
  });
  if (!response.ok) throw new Error(`Could not set the recipe's video (${response.status}): ${await response.text()}`);
}

/** Saves a language on the test account, as picking it in the app would. `resetTestUserLanguage` puts it back. */
export async function setTestUserLanguage(locale: string): Promise<void> {
  const { url, anonKey } = localSupabase();
  const { token } = await signInTestUser();
  const response = await fetch(`${url}/auth/v1/user`, {
    method: "PUT",
    headers: { apikey: anonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ data: { locale } }),
  });
  if (!response.ok) throw new Error(`Could not set the test user's language (${response.status}): ${await response.text()}`);
}
