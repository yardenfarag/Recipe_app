/**
 * Idempotency keys for paid imports (Snap, Guess the recipe). Each import sends a request id; the Edge Function
 * charges once per id. The id is kept until the app knows how the import ended, so a retry after a dropped
 * response reuses it and is never charged twice. Each app passes the storage it keeps ids in (device storage on
 * mobile, localStorage on the web).
 */

/** The storage the ids live in. Either app's: async on mobile, sync on the web; both work. */
export interface RequestIdStorage {
  getItem: (key: string) => Promise<string | null> | string | null;
  setItem: (key: string, value: string) => Promise<void> | void;
}

export interface ExtractionRequestIds {
  /** The id for this import: the stored one while its outcome is unknown, else a new one, stored first. */
  getOrCreate: (url: string) => Promise<string>;
  /** Forgets the id once the outcome is known. With `expectedId`, only if it is still that id. */
  clear: (url: string, expectedId?: string) => Promise<void>;
}

const STORAGE_KEY = '@pinch/pending-extraction-request-ids';
const MAX_PENDING_REQUESTS = 20;

interface StoredRequest {
  id: string;
  createdAt: number;
}

type StoredRequests = Record<string, StoredRequest>;

function normalizedUrl(url: string): string {
  return url.trim();
}

function newRequestId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `extract-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
  );
}

export function createExtractionRequestIds(storage: RequestIdStorage): ExtractionRequestIds {
  const loadingByUrl = new Map<string, Promise<string>>();

  async function readRequests(): Promise<StoredRequests> {
    const raw = await storage.getItem(STORAGE_KEY);
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw) as StoredRequests;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  async function writeRequests(requests: StoredRequests): Promise<void> {
    const newest = Object.entries(requests)
      .sort(([, a], [, b]) => b.createdAt - a.createdAt)
      .slice(0, MAX_PENDING_REQUESTS);
    await storage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(newest)));
  }

  function getOrCreate(url: string): Promise<string> {
    const key = normalizedUrl(url);
    const existing = loadingByUrl.get(key);
    if (existing) return existing;

    const pending = (async () => {
      const requests = await readRequests();
      if (requests[key]?.id) return requests[key].id;

      const id = newRequestId();
      requests[key] = { id, createdAt: Date.now() };
      await writeRequests(requests);
      return id;
    })();
    loadingByUrl.set(key, pending);
    void pending.catch(() => {
      if (loadingByUrl.get(key) === pending) loadingByUrl.delete(key);
    });
    return pending;
  }

  async function clear(url: string, expectedId?: string): Promise<void> {
    const key = normalizedUrl(url);
    const requests = await readRequests();
    if (!(key in requests)) {
      if (!expectedId) loadingByUrl.delete(key);
      return;
    }
    if (expectedId && requests[key]?.id !== expectedId) return;
    loadingByUrl.delete(key);
    delete requests[key];
    await writeRequests(requests);
  }

  return { getOrCreate, clear };
}
