import AsyncStorage from '@react-native-async-storage/async-storage';

import { GUEST_EXTRACTION_LIMIT } from '@/lib/quotas';

/**
 * Local mirror of guest extract remaining for UI.
 * Server `guest_usage` is authoritative; this keeps the Snap banner snappy.
 */

const STORAGE_KEY = 'pinch:guest-extraction-count';
let mutationQueue: Promise<void> = Promise.resolve();

async function readCount(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed >= 0
      ? Math.min(parsed, GUEST_EXTRACTION_LIMIT)
      : 0;
  } catch {
    return 0;
  }
}

export async function getGuestExtractionCount(): Promise<number> {
  await mutationQueue;
  return readCount();
}

export async function getGuestExtractionsRemaining(): Promise<number> {
  return GUEST_EXTRACTION_LIMIT - (await getGuestExtractionCount());
}

export function setGuestExtractionsRemaining(remaining: number): Promise<void> {
  const clamped = Math.max(0, Math.min(GUEST_EXTRACTION_LIMIT, Math.floor(remaining)));
  const used = GUEST_EXTRACTION_LIMIT - clamped;
  const result = mutationQueue.then(async () => {
    await AsyncStorage.setItem(STORAGE_KEY, String(used));
  });
  mutationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/** @deprecated Prefer syncing from server `guest_extracts_remaining`. */
export function recordGuestExtraction(): Promise<number> {
  const result = mutationQueue.then(async () => {
    const next = Math.min((await readCount()) + 1, GUEST_EXTRACTION_LIMIT);
    await AsyncStorage.setItem(STORAGE_KEY, String(next));
    return GUEST_EXTRACTION_LIMIT - next;
  });
  mutationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export { GUEST_EXTRACTION_LIMIT };
