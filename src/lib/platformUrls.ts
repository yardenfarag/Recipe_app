import type { Platform } from '@/types/recipe';

import { extractYouTubeId } from '@/lib/youtube';

/** Detects the social platform from a URL hostname. */
export function detectPlatform(url: string): Platform | 'unknown' {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return 'unknown';
  }

  if (host === 'youtube.com' || host === 'youtu.be' || host.endsWith('.youtube.com')) {
    return 'youtube';
  }
  if (host === 'instagram.com' || host.endsWith('.instagram.com')) {
    return 'instagram';
  }
  if (
    host === 'tiktok.com' ||
    host.endsWith('.tiktok.com') ||
    host === 'vm.tiktok.com' ||
    host === 'vt.tiktok.com'
  ) {
    return 'tiktok';
  }
  return 'unknown';
}

/** Extracts the Instagram reel/post shortcode from common URL shapes. */
export function extractInstagramId(url: string): string | null {
  try {
    const u = new URL(url);
    const match = u.pathname.match(/\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

/** Extracts the numeric TikTok video id when present in the URL path. */
export function extractTikTokId(url: string): string | null {
  try {
    const u = new URL(url);
    const match = u.pathname.match(/\/video\/(\d+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

/** True when two URLs refer to the same content on a supported platform. */
export function recipeUrlsMatch(
  inputUrl: string,
  storedUrl?: string | null,
  platform?: Platform | 'unknown',
): boolean {
  if (!storedUrl?.trim()) return false;

  const resolvedPlatform = platform ?? detectPlatform(inputUrl);

  if (resolvedPlatform === 'youtube') {
    const inputId = extractYouTubeId(inputUrl);
    const storedId = extractYouTubeId(storedUrl);
    if (inputId && storedId) return inputId === storedId;
  }

  if (resolvedPlatform === 'instagram') {
    const inputId = extractInstagramId(inputUrl);
    const storedId = extractInstagramId(storedUrl);
    if (inputId && storedId) return inputId === storedId;
  }

  if (resolvedPlatform === 'tiktok') {
    const inputId = extractTikTokId(inputUrl);
    const storedId = extractTikTokId(storedUrl);
    if (inputId && storedId) return inputId === storedId;
  }

  return inputUrl.trim() === storedUrl.trim();
}

/** Returns a platform content id when one can be parsed from the URL. */
export function extractContentId(url: string, platform?: Platform | 'unknown'): string | null {
  const resolved = platform ?? detectPlatform(url);
  switch (resolved) {
    case 'youtube':
      return extractYouTubeId(url);
    case 'instagram':
      return extractInstagramId(url);
    case 'tiktok':
      return extractTikTokId(url);
    default:
      return null;
  }
}
