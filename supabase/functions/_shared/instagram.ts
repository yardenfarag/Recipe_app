import { FetchError } from './errors.ts';
import {
  extractInstagramId,
  instagramFetchUrlCandidates,
  sanitizeInstagramUrl,
} from './platform.ts';
import { EMPTY_PLATFORM_META, type PlatformMeta, type PostComment } from './platformMeta.ts';
import { scrapeCreatorsGet } from './scrapecreators.ts';

const MAX_COMMENTS = 10;

/** True when Gemini cannot fetch the URL directly (Instagram CDN blocks hotlinking). */
export function isInstagramCdnUrl(url: string): boolean {
  return /cdninstagram|fbcdn\.net|scontent/i.test(url);
}

/**
 * Re-fetches the post with download_media so ScrapeCreators returns a hosted MP4
 * URL Gemini can read. Only called when the text ladder fails and video is needed.
 */
export async function resolveInstagramVideoForGemini(postUrl: string): Promise<string | undefined> {
  const fetchUrl = sanitizeInstagramUrl(postUrl);
  console.log('[instagram] download_media start', { fetchUrl });
  const started = Date.now();

  const response = await scrapeCreatorsGet<Record<string, unknown>>('/v1/instagram/post', {
    url: fetchUrl,
    download_media: 'true',
  });

  assertInstagramResponseOk(response, fetchUrl);

  const media = unwrapInstagramMedia(response);
  if (!media) {
    console.log('[instagram] download_media — no media in response', {
      ms: Date.now() - started,
      responseKeys: Object.keys(response),
    });
    return undefined;
  }

  const hosted = extractInstagramVideoUrl(media);
  if (hosted && !isInstagramCdnUrl(hosted)) {
    console.log('[instagram] download_media got hosted url', {
      ms: Date.now() - started,
      host: safeHost(hosted),
    });
    return hosted;
  }

  const data = response.data;
  if (data && typeof data === 'object') {
    const dataVideo = readString(data as Record<string, unknown>, 'video_url');
    if (dataVideo && !isInstagramCdnUrl(dataVideo)) {
      console.log('[instagram] download_media got hosted url from data', {
        ms: Date.now() - started,
        host: safeHost(dataVideo),
      });
      return dataVideo;
    }
  }

  console.log('[instagram] download_media — still CDN or missing', {
    ms: Date.now() - started,
    mediaVideoHost: hosted ? safeHost(hosted) : null,
    isCdn: hosted ? isInstagramCdnUrl(hosted) : null,
  });
  return undefined;
}

/** Fetches Instagram reel/post metadata via ScrapeCreators for the content ladder. */
export async function fetchInstagramMeta(url: string): Promise<PlatformMeta> {
  const shortcode = extractInstagramId(url);
  if (!shortcode) {
    throw new FetchError('instagram.ts: fetchInstagramMeta', 'Invalid Instagram URL', { url });
  }

  console.log('[instagram] fetchMeta start', { url, shortcode });
  const { media, fetchUrl } = await fetchInstagramMediaWithFallback(url);
  const ownerUsername = readString(media.owner, 'username');
  const ownerId = readString(media.owner, 'id');
  const topComments = extractInstagramComments(media, ownerUsername, ownerId);

  let thumbnailUrl = extractInstagramThumbnail(media);
  if (!thumbnailUrl) {
    thumbnailUrl = await fetchInstagramOembedThumbnail(fetchUrl);
  }

  const description = extractInstagramCaption(media);
  const videoUrl = extractInstagramVideoUrl(media);
  console.log('[instagram] fetchMeta done', {
    fetchUrl,
    ownerUsername,
    descriptionLen: description?.length ?? 0,
    comments: topComments.length,
    hasThumbnail: Boolean(thumbnailUrl),
    hasVideoUrl: Boolean(videoUrl),
    videoHost: videoUrl ? safeHost(videoUrl) : null,
    isCdnVideo: videoUrl ? isInstagramCdnUrl(videoUrl) : null,
  });

  return {
    description,
    thumbnailUrl,
    captions: undefined,
    topComments,
    videoUrl,
    contentId: readString(media, 'shortcode') ?? readString(media, 'code') ?? shortcode,
  };
}

async function fetchInstagramMediaWithFallback(
  url: string,
): Promise<{ media: Record<string, unknown>; fetchUrl: string }> {
  const candidates = instagramFetchUrlCandidates(url);
  let lastError: FetchError | undefined;

  console.log('[instagram] fetch candidates', { candidates });
  for (const fetchUrl of candidates) {
    try {
      console.log('[instagram] scrapeCreators GET', { fetchUrl });
      const started = Date.now();
      const response = await scrapeCreatorsGet<Record<string, unknown>>('/v1/instagram/post', {
        url: fetchUrl,
      });

      assertInstagramResponseOk(response, fetchUrl);

      const media = unwrapInstagramMedia(response);
      console.log('[instagram] scrapeCreators response', {
        fetchUrl,
        ms: Date.now() - started,
        responseKeys: Object.keys(response),
        unwrapped: Boolean(media),
        mediaKeys: media ? Object.keys(media).slice(0, 20) : [],
      });
      if (media) {
        return { media, fetchUrl: sanitizeInstagramUrl(fetchUrl) };
      }

      lastError = new FetchError('instagram.ts: fetchInstagramMeta', 'Instagram post not found', {
        url: fetchUrl,
        responseKeys: Object.keys(response),
      });
    } catch (err) {
      console.error('[instagram] scrapeCreators error', {
        fetchUrl,
        error: err instanceof Error ? err.message : String(err),
      });
      if (err instanceof FetchError) {
        lastError = err;
        if (!shouldRetryInstagramFetch(err)) throw err;
        continue;
      }
      throw err;
    }
  }

  throw (
    lastError ??
    new FetchError('instagram.ts: fetchInstagramMeta', 'Instagram post not found', {
      url: sanitizeInstagramUrl(url),
    })
  );
}

function shouldRetryInstagramFetch(err: FetchError): boolean {
  const message = err.message.toLowerCase();
  return (
    message.includes('not found') ||
    message.includes('not publicly accessible') ||
    message.includes('private')
  );
}

/** Exported for unit tests — mirrors ScrapeCreators post/reel JSON shapes. */
export function unwrapInstagramMedia(response: Record<string, unknown>): Record<string, unknown> | null {
  if (response.xdt_shortcode_media && typeof response.xdt_shortcode_media === 'object') {
    return response.xdt_shortcode_media as Record<string, unknown>;
  }

  const data = response.data;
  if (data && typeof data === 'object') {
    const dataRecord = data as Record<string, unknown>;

    for (const key of ['xdt_shortcode_media', 'shortcode_media', 'media'] as const) {
      const nested = dataRecord[key];
      if (nested && typeof nested === 'object') {
        return nested as Record<string, unknown>;
      }
    }

    if (hasInstagramMediaFields(dataRecord)) {
      return dataRecord;
    }
  }

  if (hasInstagramMediaFields(response)) {
    return response;
  }

  return null;
}

function hasInstagramMediaFields(record: Record<string, unknown>): boolean {
  return Boolean(
    record.shortcode ||
      record.owner ||
      record.video_url ||
      record.edge_media_to_caption ||
      record.display_url ||
      record.caption,
  );
}

function assertInstagramResponseOk(response: Record<string, unknown>, url: string): void {
  const status = response.status;
  if (status === 'fail' || status === 'error') {
    const message =
      (typeof response.message === 'string' && response.message) ||
      'Instagram post is not publicly accessible';
    throw new FetchError('instagram.ts: fetchInstagramMeta', message, { url, status });
  }
}

function extractInstagramCaption(media: Record<string, unknown>): string | undefined {
  const direct = readString(media, 'caption');
  if (direct) return direct;

  const captionEdges = readPath<Array<{ node?: { text?: string } }>>(
    media,
    'edge_media_to_caption',
    'edges',
  );
  const fromEdge = captionEdges?.[0]?.node?.text?.trim();
  return fromEdge || undefined;
}

function extractInstagramThumbnail(media: Record<string, unknown>): string | undefined {
  const direct =
    readString(media, 'thumbnail_src') ??
    readString(media, 'display_url') ??
    readString(media, 'thumbnail_url') ??
    readString(media, 'image_url') ??
    readString(media, 'thumbnail');

  if (direct) return direct;

  const resources = media.display_resources;
  if (Array.isArray(resources) && resources.length > 0) {
    const first = resources[0];
    if (first && typeof first === 'object' && typeof (first as { src?: string }).src === 'string') {
      return (first as { src: string }).src;
    }
  }

  const sidecar = readPath<Array<{ node?: { display_url?: string; thumbnail_src?: string } }>>(
    media,
    'edge_sidecar_to_children',
    'edges',
  );
  if (sidecar?.[0]?.node) {
    return sidecar[0].node.display_url ?? sidecar[0].node.thumbnail_src;
  }

  return undefined;
}

/** Public oEmbed fallback when ScrapeCreators omits image fields. */
async function fetchInstagramOembedThumbnail(url: string): Promise<string | undefined> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const res = await fetch(
      `https://api.instagram.com/oembed?url=${encodeURIComponent(url)}`,
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

function extractInstagramVideoUrl(media: Record<string, unknown>): string | undefined {
  const direct = readString(media, 'video_url');
  if (direct) return direct;

  const versions = media.video_versions;
  if (Array.isArray(versions) && versions.length > 0) {
    const first = versions[0];
    if (first && typeof first === 'object' && typeof (first as { url?: string }).url === 'string') {
      return (first as { url: string }).url;
    }
  }

  return undefined;
}

function extractInstagramComments(
  media: Record<string, unknown>,
  ownerUsername?: string,
  ownerId?: string,
): PostComment[] {
  const edges =
    readPath<Array<{ node?: InstagramCommentNode }>>(media, 'edge_media_to_parent_comment', 'edges') ??
    readPath<Array<{ node?: InstagramCommentNode }>>(media, 'edge_media_preview_comment', 'edges') ??
    readPath<Array<{ node?: InstagramCommentNode }>>(media, 'comments', 'edges') ??
    [];

  return edges
    .slice(0, MAX_COMMENTS)
    .map(({ node }) => {
      const text = node?.text?.trim() ?? '';
      const author = node?.owner?.username;
      const authorId = node?.owner?.id;
      const isCreator =
        Boolean(ownerUsername && author && author.toLowerCase() === ownerUsername.toLowerCase()) ||
        Boolean(ownerId && authorId && authorId === ownerId);
      return { text, isCreator };
    })
    .filter((comment) => comment.text.length > 0);
}

interface InstagramCommentNode {
  text?: string;
  owner?: { username?: string; id?: string };
}

function readString(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === 'string' && field.trim() ? field.trim() : undefined;
}

function readPath<T>(obj: Record<string, unknown>, ...keys: string[]): T | undefined {
  let current: unknown = obj;
  for (const key of keys) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current as T | undefined;
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export { EMPTY_PLATFORM_META };
