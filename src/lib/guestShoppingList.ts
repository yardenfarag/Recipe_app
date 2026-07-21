import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ShoppingListItem } from '@/types/shoppingList';

const STORAGE_KEY = 'pinch:guest-shopping-list';
let mutationQueue: Promise<void> = Promise.resolve();

async function writeGuestShoppingList(items: ShoppingListItem[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    throw new Error('Could not save shopping list. Check device storage and try again.');
  }
}

async function readGuestShoppingList(): Promise<ShoppingListItem[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(sanitizeStoredItem)
      .filter((item): item is ShoppingListItem => item !== null);
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

export async function getGuestShoppingList(): Promise<ShoppingListItem[]> {
  await mutationQueue;
  return readGuestShoppingList();
}

export async function setGuestShoppingList(items: ShoppingListItem[]): Promise<void> {
  return serializeMutation(async () => {
    await writeGuestShoppingList(items);
  });
}

export async function clearGuestShoppingList(): Promise<void> {
  return serializeMutation(async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch {
      throw new Error('Could not clear local shopping list after sync.');
    }
  });
}

function sanitizeStoredItem(value: unknown): ShoppingListItem | null {
  if (!isRecord(value)) return null;
  const id = readString(value.id);
  const name = readString(value.name);
  const created_at = readString(value.created_at);
  const updated_at = readString(value.updated_at);
  if (!id || !name || !created_at || !updated_at) return null;

  const quantity =
    value.quantity === null || value.quantity === undefined
      ? null
      : readFiniteNumber(value.quantity);
  if (value.quantity != null && quantity === null) return null;

  const unit =
    value.unit === null || value.unit === undefined ? null : readString(value.unit);
  if (value.unit != null && value.unit !== '' && unit === null) return null;

  const sourceRecipeIds = Array.isArray(value.sourceRecipeIds)
    ? value.sourceRecipeIds.filter((id): id is string => typeof id === 'string' && id.trim() !== '')
    : undefined;

  return {
    id,
    name,
    quantity,
    unit,
    checked: value.checked === true,
    sourceRecipeIds: sourceRecipeIds && sourceRecipeIds.length > 0 ? sourceRecipeIds : undefined,
    created_at,
    updated_at,
  };
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
