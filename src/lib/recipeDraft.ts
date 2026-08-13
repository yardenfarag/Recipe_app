import AsyncStorage from '@react-native-async-storage/async-storage';

import { clearExtractionRequestId } from '@/lib/extractionRequestId';
import { ExtractedRecipe } from '@/lib/supabase/extractRecipe';

const STORAGE_KEY = 'pinch:recipe-draft';
let draft: ExtractedRecipe | null = null;
let mutationQueue: Promise<void> = Promise.resolve();

type PendingExtraction = {
  url: string;
  requestId: string;
};

type PersistedDraft = {
  version: 1;
  recipe: ExtractedRecipe;
  pendingExtraction?: PendingExtraction;
};

/** Persist before navigation so a reload or process death cannot lose a paid extraction. */
export function setRecipeDraft(
  recipe: ExtractedRecipe,
  pendingExtraction?: PendingExtraction,
): Promise<void> {
  draft = recipe;
  return serializeMutation(async () => {
    const stored: PersistedDraft = { version: 1, recipe, pendingExtraction };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    if (pendingExtraction) {
      await acknowledgePendingExtraction(pendingExtraction);
    }
  });
}

export function peekRecipeDraft(): ExtractedRecipe | null {
  return draft;
}

export async function getRecipeDraft(): Promise<ExtractedRecipe | null> {
  await mutationQueue;
  if (draft) return draft;

  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    const stored = readPersistedDraft(parsed);
    if (!stored) return null;
    draft = stored.recipe;
    if (stored.pendingExtraction) {
      await acknowledgePendingExtraction(stored.pendingExtraction);
    }
    return draft;
  } catch {
    return null;
  }
}

export function clearRecipeDraft(): Promise<void> {
  draft = null;
  return serializeMutation(() => AsyncStorage.removeItem(STORAGE_KEY));
}

function serializeMutation(mutation: () => Promise<void>): Promise<void> {
  const result = mutationQueue.then(mutation, mutation);
  mutationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function acknowledgePendingExtraction(pending: PendingExtraction): Promise<void> {
  try {
    await clearExtractionRequestId(pending.url, pending.requestId);
  } catch (error) {
    // A stale idempotency key is safe; losing the draft or key is not.
    console.warn('[recipe-draft] extraction acknowledgement failed', error);
  }
}

function readPersistedDraft(value: unknown): PersistedDraft | null {
  if (isExtractedRecipe(value)) {
    return { version: 1, recipe: value };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Partial<PersistedDraft>;
  if (candidate.version !== 1 || !isExtractedRecipe(candidate.recipe)) return null;
  const pending = candidate.pendingExtraction;
  if (
    pending !== undefined &&
    (!pending ||
      typeof pending.url !== 'string' ||
      !pending.url.trim() ||
      typeof pending.requestId !== 'string' ||
      !pending.requestId.trim())
  ) {
    return null;
  }
  return {
    version: 1,
    recipe: candidate.recipe,
    pendingExtraction: pending,
  };
}

function isExtractedRecipe(value: unknown): value is ExtractedRecipe {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<ExtractedRecipe>;
  return (
    typeof candidate.title === 'string' &&
    Array.isArray(candidate.ingredients) &&
    Array.isArray(candidate.instructions) &&
    typeof candidate.servings === 'number' &&
    (candidate.extraction_status === 'full' || candidate.extraction_status === 'partial')
  );
}
