import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@pinch/pending-extraction-request-ids';
const MAX_PENDING_REQUESTS = 20;

interface StoredRequest {
  id: string;
  createdAt: number;
}

type StoredRequests = Record<string, StoredRequest>;

const loadingByUrl = new Map<string, Promise<string>>();

function normalizedUrl(url: string): string {
  return url.trim();
}

function newRequestId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `extract-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
  );
}

async function readRequests(): Promise<StoredRequests> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
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
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(newest)));
}

export function getOrCreateExtractionRequestId(url: string): Promise<string> {
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

export async function clearExtractionRequestId(
  url: string,
  expectedId?: string,
): Promise<void> {
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
