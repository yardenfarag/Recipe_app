import AsyncStorage from '@react-native-async-storage/async-storage';

import { Recipe } from '@/types/recipe';

/** ADR 002 — guests can save up to 3 recipes locally before signing up. */
export const GUEST_RECIPE_LIMIT = 3;

const STORAGE_KEY = 'pinch:guest-recipes';

export type NewGuestRecipe = Omit<Recipe, 'id' | 'created_at' | 'user_id'>;

export type SaveGuestRecipeResult =
  | { ok: true; recipe: Recipe }
  | { ok: false; reason: 'quota_exceeded' };

async function writeGuestRecipes(recipes: Recipe[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(recipes));
  } catch {
    throw new Error('Could not save to local storage. Check device storage and try again.');
  }
}

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
  await writeGuestRecipes(next);
  return { ok: true, recipe: saved };
}

export async function removeGuestRecipe(id: string): Promise<void> {
  const existing = await getGuestRecipes();
  const next = existing.filter((r) => r.id !== id);
  await writeGuestRecipes(next);
}

/** Replaces the full guest recipe list — used after thumbnail backfill. */
export async function replaceGuestRecipes(recipes: Recipe[]): Promise<void> {
  await writeGuestRecipes(recipes);
}

export async function setGuestRecipeFavorite(id: string, isFavorite: boolean): Promise<void> {
  const existing = await getGuestRecipes();
  const next = existing.map((recipe) =>
    recipe.id === id ? { ...recipe, is_favorite: isFavorite } : recipe,
  );
  await writeGuestRecipes(next);
}

/** Wipes all local guest recipes — used after a successful migration to Supabase. */
export async function clearGuestRecipes(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    throw new Error('Could not clear local recipes after sync.');
  }
}

function generateGuestId(): string {
  return `guest-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
