import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearExtractionRequestId,
  getOrCreateExtractionRequestId,
} from '@/lib/extractionRequestId';

const storageState = vi.hoisted(() => {
  const values = new Map<string, string>();
  return {
    values,
    failReads: false,
    failWrites: false,
    getItem: vi.fn(async (key: string) => {
      if (storageState.failReads) throw new Error('storage unavailable');
      return values.get(key) ?? null;
    }),
    setItem: vi.fn(async (key: string, value: string) => {
      if (storageState.failWrites) throw new Error('storage unavailable');
      values.set(key, value);
    }),
  };
});

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: storageState.getItem,
    setItem: storageState.setItem,
  },
}));

describe('extraction request ids', () => {
  beforeEach(async () => {
    storageState.values.clear();
    storageState.failReads = false;
    storageState.failWrites = false;
    vi.clearAllMocks();
    await clearExtractionRequestId('https://example.com/recipe');
  });

  it('reuses the request id while an outcome is unknown', async () => {
    const first = await getOrCreateExtractionRequestId('https://example.com/recipe');
    const retry = await getOrCreateExtractionRequestId('https://example.com/recipe');

    expect(retry).toBe(first);
  });

  it('creates a fresh request id after a confirmed response', async () => {
    const first = await getOrCreateExtractionRequestId('https://example.com/recipe');
    await clearExtractionRequestId('https://example.com/recipe');
    const next = await getOrCreateExtractionRequestId('https://example.com/recipe');

    expect(next).not.toBe(first);
  });

  it('does not start a charge when the id cannot be persisted', async () => {
    storageState.failWrites = true;

    await expect(
      getOrCreateExtractionRequestId('https://example.com/unpersisted'),
    ).rejects.toThrow('storage unavailable');
  });

  it('does not replace a recoverable id when storage cannot be read', async () => {
    storageState.failReads = true;

    await expect(
      getOrCreateExtractionRequestId('https://example.com/unreadable'),
    ).rejects.toThrow('storage unavailable');
    expect(storageState.setItem).not.toHaveBeenCalled();
  });

  it('does not clear a newer request from a stale acknowledgement', async () => {
    const url = 'https://example.com/recipe';
    const current = await getOrCreateExtractionRequestId(url);

    await clearExtractionRequestId(url, 'older-request-id');

    await expect(getOrCreateExtractionRequestId(url)).resolves.toBe(current);
  });
});
