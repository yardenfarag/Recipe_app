import AsyncStorage from '@react-native-async-storage/async-storage';

import { Recipe } from '@/types/recipe';

/** ADR 002 — guests can save up to 3 recipes locally before signing up. */
export const GUEST_RECIPE_LIMIT = 3;

const STORAGE_KEY = 'pinch:guest-recipes';

export type NewGuestRecipe = Omit<Recipe, 'id' | 'created_at' | 'user_id'>;

export type SaveGuestRecipeResult =
  | { ok: true; recipe: Recipe }
  | { ok: false; reason: 'quota_exceeded' };

export async function getGuestRecipes(): Promise<Recipe[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Recipe[]) : [];
  } catch {
    return [];
  }
}

export async function getGuestRecipeById(id: string): Promise<Recipe | null> {
  const recipes = await getGuestRecipes();
  return recipes.find((r) => r.id === id) ?? null;
}

export async function saveGuestRecipe(recipe: NewGuestRecipe): Promise<SaveGuestRecipeResult> {
  const existing = await getGuestRecipes();
  if (existing.length >= GUEST_RECIPE_LIMIT) {
    return { ok: false, reason: 'quota_exceeded' };
  }

  const saved: Recipe = {
    ...recipe,
    id: generateGuestId(),
    created_at: new Date().toISOString(),
  };

  const next = [saved, ...existing];
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return { ok: true, recipe: saved };
}

export async function removeGuestRecipe(id: string): Promise<void> {
  const existing = await getGuestRecipes();
  const next = existing.filter((r) => r.id !== id);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

/** Wipes all local guest recipes — used after a successful migration to Supabase. */
export async function clearGuestRecipes(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

function generateGuestId(): string {
  return `guest-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
