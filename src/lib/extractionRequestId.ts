import AsyncStorage from '@react-native-async-storage/async-storage';

import { createExtractionRequestIds } from '@shared/lib/extractionRequestId';

/** The mobile app's import request ids (shared/lib/extractionRequestId.ts), kept in device storage. */
const requestIds = createExtractionRequestIds(AsyncStorage);

export function getOrCreateExtractionRequestId(url: string): Promise<string> {
  return requestIds.getOrCreate(url);
}

export function clearExtractionRequestId(url: string, expectedId?: string): Promise<void> {
  return requestIds.clear(url, expectedId);
}
