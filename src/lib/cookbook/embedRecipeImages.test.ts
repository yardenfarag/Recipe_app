import { afterEach, describe, expect, it, vi } from 'vitest';

import { embedRecipeImage, embedRecipeImages } from '@/lib/cookbook/embedRecipeImages';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('embedRecipeImage', () => {
  it('returns null for a blank URL', async () => {
    expect(await embedRecipeImage('  ')).toBeNull();
  });

  it('inlines a successful fetch as a data URI', async () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => bytes,
        headers: { get: () => 'image/png' },
      }),
    );

    const uri = await embedRecipeImage('https://cdn.example.com/photo.png');
    expect(uri).toMatch(/^data:image\/png;base64,/);
  });

  it('returns null when the image cannot be fetched', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    expect(await embedRecipeImage('https://cdn.example.com/missing.jpg')).toBeNull();
  });
});

describe('embedRecipeImages', () => {
  it('skips empty slots and reports progress', async () => {
    const onProgress = vi.fn();
    const results = await embedRecipeImages([undefined, '  '], onProgress);
    expect(results).toEqual([null, null]);
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenLastCalledWith(2, 2);
  });
});
