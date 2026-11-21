import { describe, expect, it } from 'vitest';

import { createExtractionRequestIds } from './extractionRequestId';

/** Sync storage, as the web app's localStorage is. */
function memoryStorage() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value) };
}

describe('createExtractionRequestIds', () => {
  it('reuses an id until it is cleared, also from a second store on the same storage (a reload)', async () => {
    const storage = memoryStorage();
    const first = await createExtractionRequestIds(storage).getOrCreate('https://example.com/soup');
    const afterReload = createExtractionRequestIds(storage);
    expect(await afterReload.getOrCreate(' https://example.com/soup ')).toBe(first);

    await afterReload.clear('https://example.com/soup');
    expect(await afterReload.getOrCreate('https://example.com/soup')).not.toBe(first);
  });

  it('ignores a stale acknowledgement', async () => {
    const ids = createExtractionRequestIds(memoryStorage());
    const current = await ids.getOrCreate('photo:1:a');
    await ids.clear('photo:1:a', 'older');
    expect(await ids.getOrCreate('photo:1:a')).toBe(current);
  });
});
