import AsyncStorage from '@react-native-async-storage/async-storage';

import { RECIPE_VARIANTS, type RecipeVariantKey } from '@/lib/recipeVariants';

const STORAGE_KEY = 'pinch:kitchen-profile';

export type KitchenSwap = { from: string; to: string };

export type KitchenDietKey = Exclude<RecipeVariantKey, 'custom'>;

export type KitchenProfile = {
  diets: KitchenDietKey[];
  defaultServings?: number;
  alwaysSwap: KitchenSwap[];
  autoApplyOnExtract: boolean;
  /** Ingredient names that stay off the shopping list unless added by hand. */
  pantryStaples: string[];
};

export const EMPTY_KITCHEN_PROFILE: KitchenProfile = {
  diets: [],
  alwaysSwap: [],
  autoApplyOnExtract: false,
  pantryStaples: [],
};

export const MAX_PANTRY_STAPLES = 40;
const MAX_PANTRY_NAME = 60;

const DIET_KEYS = new Set<string>(RECIPE_VARIANTS.map((v) => v.key));

export function sanitizeKitchenProfile(value: unknown): KitchenProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...EMPTY_KITCHEN_PROFILE };
  }
  const raw = value as Record<string, unknown>;
  const diets = Array.isArray(raw.diets)
    ? raw.diets.filter((key): key is KitchenDietKey => typeof key === 'string' && DIET_KEYS.has(key))
    : [];
  const alwaysSwap = Array.isArray(raw.alwaysSwap)
    ? raw.alwaysSwap.flatMap((row) => {
        if (!row || typeof row !== 'object') return [];
        const from = typeof (row as KitchenSwap).from === 'string' ? (row as KitchenSwap).from.trim() : '';
        const to = typeof (row as KitchenSwap).to === 'string' ? (row as KitchenSwap).to.trim() : '';
        if (!from || !to) return [];
        return [{ from: from.slice(0, 60), to: to.slice(0, 60) }];
      }).slice(0, 8)
    : [];
  const servings = raw.defaultServings;
  const defaultServings =
    typeof servings === 'number' && Number.isInteger(servings) && servings >= 1 && servings <= 24
      ? servings
      : undefined;
  const pantryStaples = Array.isArray(raw.pantryStaples)
    ? [
        ...new Set(
          raw.pantryStaples.flatMap((item) => {
            if (typeof item !== 'string') return [];
            const name = item.trim().slice(0, MAX_PANTRY_NAME);
            return name ? [name] : [];
          }),
        ),
      ].slice(0, MAX_PANTRY_STAPLES)
    : [];
  return {
    diets: [...new Set(diets)].slice(0, 4),
    defaultServings,
    alwaysSwap,
    autoApplyOnExtract: raw.autoApplyOnExtract === true,
    pantryStaples,
  };
}

export function addPantryStaple(profile: KitchenProfile, name: string): KitchenProfile {
  const trimmed = name.trim().slice(0, MAX_PANTRY_NAME);
  if (!trimmed) return profile;
  const key = trimmed.toLowerCase();
  if (profile.pantryStaples.some((item) => item.toLowerCase() === key)) return profile;
  return {
    ...profile,
    pantryStaples: [...profile.pantryStaples, trimmed].slice(0, MAX_PANTRY_STAPLES),
  };
}

export function removePantryStaple(profile: KitchenProfile, name: string): KitchenProfile {
  const key = name.trim().toLowerCase();
  return {
    ...profile,
    pantryStaples: profile.pantryStaples.filter((item) => item.toLowerCase() !== key),
  };
}

export function kitchenInstruction(profile: KitchenProfile): string | null {
  const parts: string[] = [];
  for (const diet of profile.diets) {
    parts.push(`Adapt this recipe to be ${diet.replace(/_/g, ' ')}`);
  }
  if (profile.defaultServings) {
    parts.push(`Scale it to ${profile.defaultServings} servings`);
  }
  for (const swap of profile.alwaysSwap) {
    parts.push(`Always swap ${swap.from} for ${swap.to}`);
  }
  const text = parts.join('. ').trim();
  return text ? text.slice(0, 400) : null;
}

export const MAX_KITCHEN_JSON_BYTES = 8192;

export function assertKitchenProfileSize(profile: KitchenProfile): void {
  const bytes = new TextEncoder().encode(JSON.stringify(sanitizeKitchenProfile(profile))).length;
  if (bytes > MAX_KITCHEN_JSON_BYTES) {
    throw new Error('kitchen_too_large');
  }
}

export function kitchenProfileIsEmpty(profile: KitchenProfile): boolean {
  return (
    profile.diets.length === 0 &&
    profile.alwaysSwap.length === 0 &&
    profile.defaultServings == null &&
    profile.autoApplyOnExtract === false &&
    profile.pantryStaples.length === 0
  );
}

export async function loadGuestKitchenProfile(): Promise<KitchenProfile> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY_KITCHEN_PROFILE };
    return sanitizeKitchenProfile(JSON.parse(raw));
  } catch {
    return { ...EMPTY_KITCHEN_PROFILE };
  }
}

export async function saveGuestKitchenProfile(profile: KitchenProfile): Promise<void> {
  const next = sanitizeKitchenProfile(profile);
  assertKitchenProfileSize(next);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export async function clearGuestKitchenProfile(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
