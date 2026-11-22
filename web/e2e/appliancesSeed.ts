import { localSupabase } from "./env.mjs";
import { TEST_USER } from "./testUser";

/**
 * "My appliances" (PIN-155) on the shared test account, the way the mobile app keeps it: `user_metadata.appliances`
 * ({ owned, notOwned, savedAt }), written as the account itself (top-level keys merge, so `prefs` and `locale` stay).
 * Also gives a seeded recipe its appliance list, which `resetLibrary` doesn't. Local Supabase only (env.mjs).
 */
async function signIn(email = TEST_USER.email, password = TEST_USER.password) {
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

export type StoredAppliances = { owned: string[]; notOwned?: string[]; savedAt?: string } | null | undefined;

/** Every key in the catalog (shared/lib/appliances.ts), so a seeded list says "not owned" for the rest, as the apps do. */
const CATALOG = [
  "stovetop", "oven", "microwave", "toaster", "grill", "air_fryer", "deep_fryer", "slow_cooker", "pressure_cooker",
  "rice_cooker", "sous_vide", "blender", "immersion_blender", "food_processor", "stand_mixer", "hand_mixer",
  "spice_grinder", "mortar_and_pestle", "kitchen_thermometer", "kitchen_scale", "zester", "mandoline", "cast_iron_pan",
  "dutch_oven", "wok", "springform_pan", "pizza_stone", "ice_cream_maker", "waffle_maker", "juicer", "dehydrator", "smoker",
];

export async function readAccountAppliances(): Promise<StoredAppliances> {
  const { url, headers } = await signIn();
  const response = await fetch(`${url}/auth/v1/user`, { headers });
  if (!response.ok) throw new Error(`Could not read the account (${response.status}): ${await response.text()}`);
  const { user_metadata: metadata } = await response.json();
  return metadata?.appliances;
}

/** What the phone saves when the cook ticks `owned` (every other appliance becomes "not owned"). `null` = not set. */
export async function writeAccountAppliances(owned: string[] | null) {
  const { url, headers } = await signIn();
  const appliances = owned
    ? { owned, notOwned: CATALOG.filter((key) => !owned.includes(key)), savedAt: new Date().toISOString() }
    : null;
  const response = await fetch(`${url}/auth/v1/user`, { method: "PUT", headers, body: JSON.stringify({ data: { appliances } }) });
  if (!response.ok) throw new Error(`Could not save the account (${response.status}): ${await response.text()}`);
}

/** Back to a new account's: never answered, so no recipe checks the kitchen. */
export async function resetTestUserAppliances() {
  await writeAccountAppliances(null);
}

export type SeedAppliance = {
  key: string;
  required: boolean;
  steps: number[];
  origin?: "source" | "tip";
  alternative?: string;
  benefit?: string;
};

/** Sets a seeded recipe's "What you'll need" list, as the server's appliances task would. */
export async function setRecipeAppliances(recipeId: string, appliances: SeedAppliance[]) {
  const { url, headers } = await signIn();
  const body = appliances.map((item) => ({ origin: "source", ...item }));
  const response = await fetch(`${url}/rest/v1/recipes?id=eq.${recipeId}`, {
    method: "PATCH",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify({ appliances: body }),
  });
  if (!response.ok) throw new Error(`Could not set the recipe's appliances (${response.status}): ${await response.text()}`);
}
