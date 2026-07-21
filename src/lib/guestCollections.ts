import AsyncStorage from '@react-native-async-storage/async-storage';

import type { RecipeCollection } from '@/types/collection';

const STORAGE_KEY = 'pinch:guest-collections';
let mutationQueue: Promise<void> = Promise.resolve();

async function writeGuestCollections(collections: RecipeCollection[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(collections));
  } catch {
    throw new Error('Could not save collections. Check device storage and try again.');
  }
}

async function readGuestCollections(): Promise<RecipeCollection[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(sanitizeCollection)
      .filter((item): item is RecipeCollection => item !== null);
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

export async function getGuestCollections(): Promise<RecipeCollection[]> {
  await mutationQueue;
  return readGuestCollections();
}

export async function setGuestCollections(collections: RecipeCollection[]): Promise<void> {
  return serializeMutation(async () => {
    await writeGuestCollections(collections);
  });
}

export async function clearGuestCollections(): Promise<void> {
  return serializeMutation(async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch {
      throw new Error('Could not clear local collections after sync.');
    }
  });
}

function sanitizeCollection(value: unknown): RecipeCollection | null {
  if (!isRecord(value)) return null;
  const id = readString(value.id);
  const name = readString(value.name);
  const created_at = readString(value.created_at);
  if (!id || !name || !created_at) return null;
  const recipeIds = Array.isArray(value.recipeIds)
    ? value.recipeIds.filter((rid): rid is string => typeof rid === 'string' && rid.trim() !== '')
    : [];
  return { id, name, recipeIds, created_at };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
