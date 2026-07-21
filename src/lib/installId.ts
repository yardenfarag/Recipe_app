import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'pinch:install-id';

function createInstallId(): string {
  const cryptoObj = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID();
  return `guest-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Stable per-install id for server-side guest extract quotas. */
export async function getInstallId(): Promise<string> {
  try {
    const existing = await AsyncStorage.getItem(STORAGE_KEY);
    if (existing && existing.length >= 8) return existing;
  } catch {
    // Fall through to create.
  }

  const next = createInstallId();
  try {
    await AsyncStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Still return an id for this session so the request can proceed.
  }
  return next;
}
