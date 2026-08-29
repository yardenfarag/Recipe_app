import { encode } from 'base64-arraybuffer';

import { recipeImageHeaders } from '@/lib/recipeImageSource';

const FETCH_MS = 10_000;

function mimeFromUrl(uri: string, contentType: string | null): string {
  const header = contentType?.split(';')[0]?.trim();
  if (header?.startsWith('image/')) return header;
  if (/\.png(\?|$)/i.test(uri)) return 'image/png';
  if (/\.webp(\?|$)/i.test(uri)) return 'image/webp';
  if (/\.gif(\?|$)/i.test(uri)) return 'image/gif';
  return 'image/jpeg';
}

/** Fetch a recipe image and return a `data:` URI, or null if it cannot be inlined. */
export async function embedRecipeImage(uri: string): Promise<string | null> {
  const trimmed = uri.trim();
  if (!trimmed) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_MS);
  try {
    const headers = recipeImageHeaders(trimmed);
    const response = await fetch(trimmed, {
      headers,
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength === 0) return null;
    const mime = mimeFromUrl(trimmed, response.headers.get('content-type'));
    return `data:${mime};base64,${encode(buffer)}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function embedRecipeImages(
  urls: Array<string | undefined | null>,
  onProgress?: (done: number, total: number) => void,
): Promise<Array<string | null>> {
  const total = urls.length;
  const results: Array<string | null> = [];
  let done = 0;
  for (const url of urls) {
    results.push(url ? await embedRecipeImage(url) : null);
    done += 1;
    onProgress?.(done, total);
  }
  return results;
}
