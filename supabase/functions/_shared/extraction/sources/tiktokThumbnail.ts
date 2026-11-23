import { type ImageCandidate, rankImageCandidates } from '../imageSize.ts';

interface TikTokCoverFields {
  cover?: unknown;
  dynamic_cover?: unknown;
  origin_cover?: unknown;
  ai_dynamic_cover?: unknown;
  animated_cover?: unknown;
}

/**
 * `origin_cover` is the video's own frame. `cover` is TikTok's 300×400 preview: every TikTok cover
 * stored before 2026-11-23 was that one, and looked blurry (PIN-176). The animated ones come last.
 */
const COVER_FIELD_ORDER = [
  'origin_cover',
  'cover',
  'dynamic_cover',
  'ai_dynamic_cover',
  'animated_cover',
] as const;

/** TikTok's cover pictures from a ScrapeCreators payload, best first. */
export function extractTikTokThumbnails(
  video: TikTokCoverFields | undefined,
  response: Record<string, unknown>,
): string[] {
  const candidates: ImageCandidate[] = [];
  if (video) {
    for (const key of COVER_FIELD_ORDER) {
      const candidate = browserImageFromList(video[key]);
      if (candidate) candidates.push(candidate);
    }
  }

  for (const key of ['cover_url', 'thumbnail_url', 'thumbnail', 'cover']) {
    const value = response[key];
    if (typeof value === 'string' && value.trim() && !isHeic(value)) candidates.push({ url: value.trim() });
    const fromList = browserImageFromList(value);
    if (fromList) candidates.push(fromList);
  }

  return rankImageCandidates(candidates);
}

/** The best TikTok cover/thumbnail URL from a ScrapeCreators payload. */
export function extractTikTokThumbnail(
  video: TikTokCoverFields | undefined,
  response: Record<string, unknown>,
): string | undefined {
  return extractTikTokThumbnails(video, response)[0];
}

/**
 * TikTok lists each cover in several formats, HEIC first: `[….heic, ….heic, ….jpeg]`. Only Apple
 * devices show HEIC, so take the JPEG (or another web format) and skip HEIC altogether. The width and
 * height TikTok states are left out: they don't always match the file, so the field order ranks them
 * and persistThumbnail measures what it downloads.
 */
function browserImageFromList(value: unknown): ImageCandidate | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const list = (value as Record<string, unknown>).url_list;
  if (!Array.isArray(list)) return undefined;
  const urls = list.filter((url): url is string => typeof url === 'string' && url.trim() !== '');
  const url = urls.find((url) => /\.(jpe?g|png|webp)$/i.test(urlPath(url))) ?? urls.find((url) => !isHeic(url));
  return url ? { url } : undefined;
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
