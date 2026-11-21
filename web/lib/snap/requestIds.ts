import { createExtractionRequestIds, type ExtractionRequestIds, type RequestIdStorage } from "@shared/lib/extractionRequestId";
import type { ExtractionRequestContext } from "@shared/lib/supabase/extractRecipe";

/**
 * The web app's import request ids (shared/lib/extractionRequestId.ts), kept in localStorage so a reload during an
 * import retries with the same id and isn't charged twice. If storage is blocked, they last for this tab.
 */
let ids: ExtractionRequestIds | null = null;

function browserStorage(): RequestIdStorage {
  const memory = new Map<string, string>();
  return {
    getItem: (key) => {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return memory.get(key) ?? null;
      }
    },
    setItem: (key, value) => {
      memory.set(key, value);
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // Kept in memory for this tab.
      }
    },
  };
}

function requestIds(): ExtractionRequestIds {
  ids ??= createExtractionRequestIds(browserStorage());
  return ids;
}

/** What the shared import calls need from the web app. No guest install id: Snap on the web needs an account. */
export const webExtractionContext: ExtractionRequestContext = {
  getOrCreateRequestId: (key) => requestIds().getOrCreate(key),
};

/** Forgets a request id once its import's outcome is known and nothing is left to keep. */
export async function acknowledgeRequest(key: string, requestId: string): Promise<void> {
  try {
    await requestIds().clear(key, requestId);
  } catch (error) {
    // A stale id is safe; losing the draft or the id is not (as on mobile).
    console.warn("[snap] request acknowledgement failed", error);
  }
}
