import AsyncStorage from '@react-native-async-storage/async-storage';

import { Recipe } from '@/types/recipe';

/** ADR 002 — guests can save up to 3 recipes locally before signing up. */
export const GUEST_RECIPE_LIMIT = 3;

const STORAGE_KEY = 'pinch:guest-recipes';
let mutationQueue: Promise<void> = Promise.resolve();

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

async function readGuestRecipes(): Promise<Recipe[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitizeStoredRecipe).filter((recipe): recipe is Recipe => recipe !== null);
  } catch {
    return [];
  }
}

function serializeMutation<T>(mutation: () => Promise<T>): Promise<T> {
  const result = mutationQueue.then(mutation, mutation);
  mutationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export async function getGuestRecipes(): Promise<Recipe[]> {
  await mutationQueue;
  return readGuestRecipes();
}

export async function getGuestRecipeById(id: string): Promise<Recipe | null> {
  const recipes = await getGuestRecipes();
  return recipes.find((r) => r.id === id) ?? null;
}

export async function saveGuestRecipe(recipe: NewGuestRecipe): Promise<SaveGuestRecipeResult> {
  return serializeMutation(async () => {
    const existing = await readGuestRecipes();
    if (existing.length >= GUEST_RECIPE_LIMIT) {
      return { ok: false, reason: 'quota_exceeded' };
    }

    const saved: Recipe = {
      ...recipe,
      id: generateGuestId(),
      created_at: new Date().toISOString(),
    };

    await writeGuestRecipes([saved, ...existing]);
    return { ok: true, recipe: saved };
  });
}

export async function removeGuestRecipe(id: string): Promise<void> {
  return serializeMutation(async () => {
    const existing = await readGuestRecipes();
    await writeGuestRecipes(existing.filter((recipe) => recipe.id !== id));
  });
}

/** Replaces the full guest recipe list — used after thumbnail backfill. */
export async function replaceGuestRecipes(recipes: Recipe[]): Promise<void> {
  return serializeMutation(() => writeGuestRecipes(recipes));
}

export async function setGuestRecipeFavorite(id: string, isFavorite: boolean): Promise<void> {
  return serializeMutation(async () => {
    const existing = await readGuestRecipes();
    const next = existing.map((recipe) =>
      recipe.id === id ? { ...recipe, is_favorite: isFavorite } : recipe,
    );
    await writeGuestRecipes(next);
  });
}

export async function setGuestRecipeTags(id: string, tags: string[]): Promise<void> {
  return serializeMutation(async () => {
    const existing = await readGuestRecipes();
    const next = existing.map((recipe) =>
      recipe.id === id ? { ...recipe, tags } : recipe,
    );
    await writeGuestRecipes(next);
  });
}

/** Persists remix / swap / translate edits on a local guest recipe. */
export async function updateGuestRecipeContent(
  id: string,
  content: {
    title: string;
    servings: number;
    ingredients: Recipe['ingredients'];
    instructions: Recipe['instructions'];
    calories?: number;
  },
): Promise<Recipe | null> {
  return serializeMutation(async () => {
    const existing = await readGuestRecipes();
    let updated: Recipe | null = null;
    const next = existing.map((recipe) => {
      if (recipe.id !== id) return recipe;
      updated = {
        ...recipe,
        title: content.title,
        servings: content.servings,
        ingredients: content.ingredients,
        instructions: content.instructions,
        calories: content.calories,
      };
      return updated;
    });
    if (!updated) return null;
    await writeGuestRecipes(next);
    return updated;
  });
}

/** Wipes all local guest recipes — used after a successful migration to Supabase. */
export async function clearGuestRecipes(): Promise<void> {
  return serializeMutation(async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch {
      throw new Error('Could not clear local recipes after sync.');
    }
  });
}

function generateGuestId(): string {
  return `guest-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeStoredRecipe(value: unknown): Recipe | null {
  if (!isRecord(value)) return null;

  const id = readString(value.id);
  const title = readString(value.title);
  const servings = readPositiveNumber(value.servings);
  const extractionStatus =
    value.extraction_status === 'full' || value.extraction_status === 'partial'
      ? value.extraction_status
      : null;
  const ingredients = sanitizeIngredients(value.ingredients);
  const instructions = sanitizeInstructions(value.instructions);

  if (!id || !title || !servings || !extractionStatus || !ingredients || !instructions) {
    return null;
  }

  const recipe: Recipe = {
    id,
    title,
    servings,
    extraction_status: extractionStatus,
    ingredients,
    instructions,
  };

  assignString(recipe, 'user_id', value.user_id);
  assignString(recipe, 'original_url', value.original_url);
  assignString(recipe, 'image_url', value.image_url);
  assignString(recipe, 'calories_reasoning', value.calories_reasoning);
  assignString(recipe, 'time_reasoning', value.time_reasoning);
  assignString(recipe, 'created_at', value.created_at);
  assignNumber(recipe, 'calories', value.calories);
  assignNumber(recipe, 'estimated_time_minutes', value.estimated_time_minutes);

  if (['youtube', 'instagram', 'tiktok', 'unknown'].includes(String(value.platform))) {
    recipe.platform = value.platform as Recipe['platform'];
  }
  if (['$', '$$', '$$$'].includes(String(value.cost_estimate))) {
    recipe.cost_estimate = value.cost_estimate as Recipe['cost_estimate'];
  }
  if (['Easy', 'Medium', 'Hard'].includes(String(value.effort_level))) {
    recipe.effort_level = value.effort_level as Recipe['effort_level'];
  }
  if (['description', 'comments', 'captions', 'video'].includes(String(value.extraction_source))) {
    recipe.extraction_source = value.extraction_source as Recipe['extraction_source'];
  }
  if (typeof value.is_favorite === 'boolean') recipe.is_favorite = value.is_favorite;
  if (typeof value.migrated_from_guest === 'boolean') {
    recipe.migrated_from_guest = value.migrated_from_guest;
  }

  const tags = sanitizeStringArray(value.tags);
  if (tags) recipe.tags = tags;
  const missingFields = sanitizeStringArray(value.missing_fields);
  if (missingFields) recipe.missing_fields = missingFields;

  return recipe;
}

function sanitizeIngredients(value: unknown): Recipe['ingredients'] | null {
  if (!Array.isArray(value) || value.length > 100) return null;
  const ingredients: Recipe['ingredients'] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const name = readString(item.name);
    const unit = readString(item.unit);
    const quantity = readFiniteNumber(item.quantity);
    if (!name || !unit || quantity === null) return null;
    ingredients.push({ name, unit, quantity });
  }
  return ingredients;
}

function sanitizeInstructions(value: unknown): Recipe['instructions'] | null {
  if (!Array.isArray(value) || value.length > 100) return null;
  const instructions: Recipe['instructions'] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const text = readString(item.text);
    const step = readFiniteNumber(item.step);
    if (!text || step === null) return null;
    instructions.push({ text, step });
  }
  return instructions;
}

function sanitizeStringArray(value: unknown): string[] | null {
  if (value == null) return null;
  if (!Array.isArray(value) || value.length > 100) return null;
  const strings = value.map(readString);
  return strings.every((item): item is string => item !== null) ? strings : null;
}

function assignString<K extends keyof Recipe>(
  recipe: Recipe,
  key: K,
  value: unknown,
): void {
  const stringValue = readString(value);
  if (stringValue) Object.assign(recipe, { [key]: stringValue });
}

function assignNumber<K extends keyof Recipe>(
  recipe: Recipe,
  key: K,
  value: unknown,
): void {
  const numberValue = readFiniteNumber(value);
  if (numberValue !== null) Object.assign(recipe, { [key]: numberValue });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readPositiveNumber(value: unknown): number | null {
  const number = readFiniteNumber(value);
  return number !== null && number > 0 ? number : null;
}
