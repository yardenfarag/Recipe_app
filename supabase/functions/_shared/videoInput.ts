/**
 * Turns a platform video URL into an LLM part OpenRouter can use.
 *
 * OpenRouter only forwards video *URLs* to providers that fetch them, and on
 * Google AI Studio that means YouTube links only. Instagram and TikTok clips
 * are downloaded here and sent inline as base64 (ADR 015). Instagram's CDN
 * answers a plain browser-style fetch, so the paid ScrapeCreators hosted copy
 * is only a fallback.
 */

import { isInstagramCdnUrl, resolveInstagramVideoForGemini } from './instagram.ts';
import type { LlmPart } from './llmClient.ts';
import type { Platform } from './platform.ts';

/** Inline video cap. Qwen rejects ~16 MB clips with 413; Gemini's inline limit is 20 MB. */
export const MAX_INLINE_VIDEO_BYTES = 20_000_000;
const DOWNLOAD_TIMEOUT_MS = 25_000;
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export type VideoSkipReason =
  | 'no_url'
  | 'instagram_unavailable'
  | 'download_failed'
  | 'too_large'
  | 'not_video';

export type ResolvedVideoPart =
  | { part: LlmPart; usedInstagramVideoDownload: boolean; bytes: number | null }
  | { part: null; usedInstagramVideoDownload: boolean; reason: VideoSkipReason };

export function isYouTubeUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'youtu.be' || host.endsWith('youtube.com');
  } catch {
    return false;
  }
}

function refererFor(platform: Platform): string | undefined {
  if (platform === 'tiktok') return 'https://www.tiktok.com/';
  if (platform === 'instagram') return 'https://www.instagram.com/';
  return undefined;
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Downloads a clip and returns it as an inline video part, or null with the reason. */
export async function downloadVideoAsPart(
  url: string,
  options: { referer?: string; maxBytes?: number } = {},
): Promise<{ part: LlmPart; bytes: number } | { part: null; reason: VideoSkipReason }> {
  const maxBytes = options.maxBytes ?? MAX_INLINE_VIDEO_BYTES;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  const started = Date.now();
  try {
    const headers: Record<string, string> = { 'User-Agent': USER_AGENT, Accept: 'video/*,*/*;q=0.8' };
    if (options.referer) headers.Referer = options.referer;
    const res = await fetch(url, { headers, signal: controller.signal, redirect: 'follow' });
    if (!res.ok) {
      console.warn('[video] download HTTP error', { host: safeHost(url), status: res.status });
      return { part: null, reason: 'download_failed' };
    }
    const declared = Number(res.headers.get('content-length') ?? 0);
    if (declared > maxBytes) {
      console.warn('[video] download skipped — too large', { host: safeHost(url), declared, maxBytes });
      return { part: null, reason: 'too_large' };
    }
    const contentType = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > maxBytes) {
      console.warn('[video] download too large after read', { host: safeHost(url), bytes: bytes.byteLength });
      return { part: null, reason: 'too_large' };
    }
    if (bytes.byteLength < 1_000) {
      console.warn('[video] download too small to be a video', { host: safeHost(url), bytes: bytes.byteLength });
      return { part: null, reason: 'not_video' };
    }
    const mimeType = contentType.startsWith('video/') ? contentType : 'video/mp4';
    console.log('[video] download ok', {
      host: safeHost(url),
      bytes: bytes.byteLength,
      mimeType,
      ms: Date.now() - started,
    });
    return { part: { imageBase64: encodeBase64(bytes), mimeType }, bytes: bytes.byteLength };
  } catch (err) {
    console.warn('[video] download failed', {
      host: safeHost(url),
      ms: Date.now() - started,
      timedOut: err instanceof Error && err.name === 'AbortError',
      error: err instanceof Error ? err.message : String(err),
    });
    return { part: null, reason: 'download_failed' };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Resolves the video part for the ladder's video rung.
 *
 * - YouTube URLs pass through as a URL part (AI Studio fetches them).
 * - Everything else is downloaded and sent inline. Instagram CDN URLs usually
 *   download fine from the function; when the CDN refuses, a ScrapeCreators-
 *   hosted copy (download_media, ~10 extra credits) is fetched instead.
 */
export async function resolveVideoPart(input: {
  platform: Platform;
  sourceUrl: string;
  videoUrl?: string;
}): Promise<ResolvedVideoPart> {
  const videoUri = input.videoUrl?.trim();
  if (!videoUri) return { part: null, usedInstagramVideoDownload: false, reason: 'no_url' };

  if (isYouTubeUrl(videoUri)) {
    return { part: { fileData: { fileUri: videoUri } }, usedInstagramVideoDownload: false, bytes: null };
  }

  const direct = await downloadVideoAsPart(videoUri, { referer: refererFor(input.platform) });
  if (direct.part) {
    return { part: direct.part, usedInstagramVideoDownload: false, bytes: direct.bytes };
  }
  if (direct.reason === 'too_large' || input.platform !== 'instagram' || !isInstagramCdnUrl(videoUri)) {
    return { part: null, usedInstagramVideoDownload: false, reason: direct.reason };
  }

  // The CDN refused: pay for a hosted copy and try once more.
  const resolveStarted = Date.now();
  let hosted: string | undefined;
  try {
    hosted = await resolveInstagramVideoForGemini(input.sourceUrl);
  } catch (err) {
    console.error('[video] hosted Instagram resolve failed', {
      ms: Date.now() - resolveStarted,
      error: err instanceof Error ? err.message : String(err),
    });
    return { part: null, usedInstagramVideoDownload: false, reason: 'instagram_unavailable' };
  }
  console.log('[video] hosted Instagram resolve done', {
    ms: Date.now() - resolveStarted,
    gotHosted: Boolean(hosted),
    hostedHost: hosted ? safeHost(hosted) : null,
  });
  if (!hosted || isInstagramCdnUrl(hosted)) {
    return { part: null, usedInstagramVideoDownload: true, reason: 'instagram_unavailable' };
  }
  const viaHosted = await downloadVideoAsPart(hosted);
  if (!viaHosted.part) {
    return { part: null, usedInstagramVideoDownload: true, reason: viaHosted.reason };
  }
  return { part: viaHosted.part, usedInstagramVideoDownload: true, bytes: viaHosted.bytes };
}
