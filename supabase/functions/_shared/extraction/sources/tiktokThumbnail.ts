import { firstUrlList } from './scrapecreators.ts';

interface TikTokCoverFields {
  cover?: unknown;
  dynamic_cover?: unknown;
  origin_cover?: unknown;
  ai_dynamic_cover?: unknown;
  animated_cover?: unknown;
}

const COVER_FIELD_ORDER = [
  'cover',
  'dynamic_cover',
  'origin_cover',
  'ai_dynamic_cover',
  'animated_cover',
] as const;

/** Picks the best available TikTok cover/thumbnail URL from a ScrapeCreators payload. */
export function extractTikTokThumbnail(
  video: TikTokCoverFields | undefined,
  response: Record<string, unknown>,
): string | undefined {
  if (video) {
    for (const key of COVER_FIELD_ORDER) {
      const url = firstUrlList(video[key]);
      if (url) return url;
    }
  }

  for (const key of ['cover_url', 'thumbnail_url', 'thumbnail', 'cover']) {
    const value = response[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    const fromList = firstUrlList(value);
    if (fromList) return fromList;
  }

  return undefined;
}

/** Free fallback when ScrapeCreators omits cover fields — TikTok's public oEmbed endpoint. */
export async function fetchTikTokOembedThumbnail(url: string): Promise<string | undefined> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const res = await fetch(
      `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`,
      {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      },
    );
    if (!res.ok) return undefined;

    const data = (await res.json()) as { thumbnail_url?: string };
    return data.thumbnail_url?.trim() || undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}
