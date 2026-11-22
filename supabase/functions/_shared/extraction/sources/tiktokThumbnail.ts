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
      const url = browserImageFromList(video[key]);
      if (url) return url;
    }
  }

  for (const key of ['cover_url', 'thumbnail_url', 'thumbnail', 'cover']) {
    const value = response[key];
    if (typeof value === 'string' && value.trim() && !isHeic(value)) return value.trim();
    const fromList = browserImageFromList(value);
    if (fromList) return fromList;
  }

  return undefined;
}

/**
 * TikTok lists each cover in several formats, HEIC first: `[….heic, ….heic, ….jpeg]`. Only Apple
 * devices show HEIC, so take the JPEG (or another web format) and skip HEIC altogether.
 */
function browserImageFromList(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const list = (value as Record<string, unknown>).url_list;
  if (!Array.isArray(list)) return undefined;
  const urls = list.filter((url): url is string => typeof url === 'string' && url.trim() !== '');
  return urls.find((url) => /\.(jpe?g|png|webp)$/i.test(urlPath(url))) ?? urls.find((url) => !isHeic(url));
}

function isHeic(url: string): boolean {
  return /\.hei[cf]$/i.test(urlPath(url));
}

function urlPath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url.split('?')[0];
  }
}
