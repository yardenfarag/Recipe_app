import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  EMPTY_KITCHEN_PROFILE,
  assertKitchenProfileSize,
  sanitizeKitchenProfile,
  type KitchenProfile,
} from '@shared/lib/kitchenProfile';

export * from '@shared/lib/kitchenProfile';

/** A guest's kitchen profile lives on the device. The shape and its rules are in shared/lib/kitchenProfile.ts. */
const STORAGE_KEY = 'pinch:kitchen-profile';

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
