import { localSupabase } from "./env.mjs";
import { TEST_USER } from "./testUser";

/**
 * Cooking Hub data for the browser tests, in local Supabase only (env.mjs refuses anything else). Hub cards are
 * written by the server alone, so they are seeded with the service role. Every seeded card's link is on
 * e2e-hub.example and its title starts with "E2E Hub", so the tests can find exactly their own cards among any
 * others, and clear them again.
 */

const HOST = "https://e2e-hub.example";
export const HUB_TITLE_PREFIX = "E2E Hub";

export type SeedCard = {
  /** Becomes the title, after "E2E Hub ". */
  name: string;
  platform?: "youtube" | "instagram" | "tiktok" | "web";
  save_count?: number;
  tags?: string[];
  /** The kitchen-profile diets the card fits as written. */
  diets?: string[];
  /** Seconds before now, so "Newest" has a known order. */
  createdSecondsAgo?: number;
  /** Ingredient names, for avoid-list tests. Default: flour and water. */
  ingredients?: string[];
  /** Allergen and one-tap dislike keys the card has (PIN-180). */
  contains?: string[];
};

export type SeededCard = { id: string; title: string; public_slug: string };

function serviceHeaders() {
  const { serviceRoleKey } = localSupabase();
  return { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" };
}

async function ok(response: Response, what: string) {
  if (!response.ok) throw new Error(`${what} failed (${response.status}): ${await response.text()}`);
  return response;
}

/** The test account's id and a token for calling the API as it. */
export async function signInTestUser(): Promise<{ id: string; token: string }> {
  const { url, anonKey } = localSupabase();
  const response = await ok(
    await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email: TEST_USER.email, password: TEST_USER.password }),
    }),
    "Signing in the test user",
  );
  const { access_token: token, user } = await response.json();
  return { id: user.id, token };
}

/** Removes every card an earlier run seeded, then adds `cards`. Returns them in the same order. */
export async function resetHub(cards: SeedCard[]): Promise<SeededCard[]> {
  const { url } = localSupabase();
  await ok(
    await fetch(`${url}/rest/v1/recipe_cards?original_url=like.${encodeURIComponent(`${HOST}/*`)}`, {
      method: "DELETE",
      headers: { ...serviceHeaders(), Prefer: "return=minimal" },
    }),
    "Clearing seeded Hub cards",
  );
  if (cards.length === 0) return [];

  const now = Date.now();
  const rows = cards.map((card, index) => {
    const path = card.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const link = `${HOST}/${path}`;
    return {
      canonical_key: `web:${link}`,
      canonical_url: link,
      original_url: link,
      platform: card.platform ?? "web",
      title: `${HUB_TITLE_PREFIX} ${card.name}`,
      ingredients: card.ingredients
        ? card.ingredients.map((name) => ({ name, quantity: 1, unit: "cup" }))
        : [
            { name: "flour", quantity: 1, unit: "cup" },
            { name: "water", quantity: 0.5, unit: "cup" },
          ],
      instructions: [
        { step: 1, text: "Mix the flour and water." },
        { step: 2, text: "Bake until golden." },
      ],
      servings: 2,
      estimated_time_minutes: 25,
      effort_level: "Easy",
      extraction_status: "full",
      tags: card.tags ?? [],
      diets: card.diets ?? null,
      contains: card.contains ?? null,
      source_language: "en",
      save_count: card.save_count ?? 0,
      created_at: new Date(now - (card.createdSecondsAgo ?? index) * 1000).toISOString(),
    };
  });
  const response = await ok(
    await fetch(`${url}/rest/v1/recipe_cards?select=id,title,public_slug`, {
      method: "POST",
      headers: { ...serviceHeaders(), Prefer: "return=representation" },
      body: JSON.stringify(rows),
    }),
    "Adding Hub cards",
  );
  const inserted = (await response.json()) as SeededCard[];
  // The response keeps the order of the rows sent, but match on the title to be sure.
  return rows.map((row) => inserted.find((card) => card.title === row.title)!);
}

/**
 * Sets the test account's kitchen diets ("Usually cook"), which put fitting Hub recipes first, and its avoid list,
 * which puts recipes with its allergies last and ones with its dislikes lower (PIN-180).
 */
export async function setKitchenDiets(
  diets: string[],
  avoid: { allergies?: string[]; otherAllergies?: string[]; dislikes?: string[] } = {},
) {
  const { url } = localSupabase();
  const { id } = await signInTestUser();
  const kitchen = {
    diets,
    alwaysSwap: [],
    autoApplyOnExtract: false,
    pantryStaples: [],
    allergies: avoid.allergies ?? [],
    otherAllergies: avoid.otherAllergies ?? [],
    dislikes: avoid.dislikes ?? [],
    ...(avoid.allergies?.length ? { allergyNoticeAcceptedAt: new Date().toISOString() } : {}),
  };
  await ok(
    await fetch(`${url}/rest/v1/profiles?id=eq.${id}`, {
      method: "PATCH",
      headers: { ...serviceHeaders(), Prefer: "return=minimal" },
      body: JSON.stringify({ kitchen }),
    }),
    "Setting kitchen diets",
  );
}

/** What the test account has to spend: credits, and free extracts used. Adding from the Hub must not change it. */
export async function creditState(): Promise<{ token_balance: number; free_extracts_used: number }> {
  const { url } = localSupabase();
  const { id } = await signInTestUser();
  const response = await ok(
    await fetch(`${url}/rest/v1/profiles?id=eq.${id}&select=token_balance,free_extracts_used`, { headers: serviceHeaders() }),
    "Reading credits",
  );
  const [row] = await response.json();
  return row;
}

/**
 * The titles the Hub query gives for these filters, called as the test account, exactly as the mobile app calls it
 * (shared/lib/supabase/cookingHub.ts fetchHubCards: the hub_cards_for_cook function, one row more than a page).
 */
export async function hubTitles(filters: {
  search?: string;
  platform?: string;
  tags?: string[];
  sort?: "popular" | "newest";
  diets?: string[];
  allergens?: string[];
  dislikes?: string[];
}) {
  const { url, anonKey } = localSupabase();
  const { token } = await signInTestUser();
  const response = await ok(
    await fetch(`${url}/rest/v1/rpc/hub_cards_for_cook`, {
      method: "POST",
      headers: { apikey: anonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        p_diets: filters.diets?.length ? filters.diets : null,
        p_platform: filters.platform && filters.platform !== "all" ? filters.platform : null,
        p_search: filters.search ?? null,
        p_tags: filters.tags?.length ? filters.tags : null,
        p_sort: filters.sort ?? "popular",
        p_offset: 0,
        p_limit: 41,
        p_allergens: filters.allergens?.length ? filters.allergens : null,
        p_dislikes: filters.dislikes?.length ? filters.dislikes : null,
        p_allergy_words: null,
        p_dislike_words: null,
      }),
    }),
    "Calling hub_cards_for_cook",
  );
  return ((await response.json()) as { title: string }[]).map((card) => card.title).slice(0, 40);
}
