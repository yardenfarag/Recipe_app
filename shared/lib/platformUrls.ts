import type { Platform } from '../types/recipe';

import { extractYouTubeId } from './youtube';

const SOCIAL_DOMAIN_PATTERN =
  /(?:www\.)?(?:youtube\.com|youtu\.be|instagram\.com|tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com|(?:m\.|web\.)?facebook\.com|fb\.watch|(?:[a-z]{2}\.)?pinterest\.(?:com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})|pin\.it)\/[^\s<>"']+/i;

/**
 * pinterest.com with any subdomain (www., uk., de., …) and Pinterest's country domains
 * (pinterest.co.uk, pinterest.de, pinterest.com.au, …). `pin.it` is its short link (PIN-70).
 */
const PINTEREST_HOST = /^(?:[a-z0-9-]+\.)?pinterest\.(?:com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$/;

function isPinterestHost(host: string): boolean {
  return host === 'pin.it' || PINTEREST_HOST.test(host);
}

/** Bare host/path without scheme (share text sometimes omits https). */
const BARE_URL_PATTERN =
  /(?:www\.)?(?:[a-z0-9-]+\.)+[a-z]{2,}\/[^\s<>"']+/i;

/**
 * Pulls a recipe URL from pasted/share-sheet text and normalizes scheme-less
 * links. Accepts YouTube / Instagram / TikTok / Facebook / Pinterest and other public http(s) pages.
 */
export function normalizeSocialUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Reject non-http(s) schemes even when a host/path is present.
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^https?:/i.test(trimmed)) {
    return null;
  }

  const absoluteMatch = trimmed.match(/https?:\/\/[^\s<>"']+/i)?.[0];
  const bareMatch = absoluteMatch
    ? null
    : trimmed.match(SOCIAL_DOMAIN_PATTERN)?.[0] ?? trimmed.match(BARE_URL_PATTERN)?.[0];
  const candidate = (absoluteMatch ?? (bareMatch ? `https://${bareMatch}` : ''))
    .replace(/[)\]},.!?;:]+$/g, '')
    .trim();

  if (!candidate) return null;

  try {
    const parsed = new URL(candidate);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    const platform = detectPlatform(parsed.toString());
    return platform === 'unknown' ? null : parsed.toString();
  } catch {
    return null;
  }
}

/** Detects the content platform from a URL hostname. */
export function detectPlatform(url: string): Platform | 'unknown' {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'unknown';
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return 'unknown';
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');

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
  // m., web. and mbasic. are the same posts on Facebook's other front ends; fb.watch is its video short link.
  if (host === 'facebook.com' || host.endsWith('.facebook.com') || host === 'fb.watch') {
    return 'facebook';
  }
  if (isPinterestHost(host)) {
    return 'pinterest';
  }

  if (host && host !== 'localhost' && !host.endsWith('.localhost') && !host.endsWith('.local')) {
    return 'web';
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

/**
 * Extracts the numeric id of a Facebook reel, video or post when the URL carries one.
 * Share links (`/share/...`, `fb.watch`) and `pfbid...` post ids are opaque and give null;
 * the server resolves those (PIN-66).
 */
export function extractFacebookId(url: string): string | null {
  try {
    const u = new URL(url);
    const fromPath = u.pathname.match(
      /\/(?:reel|videos|posts|permalink)\/(?:[^/]+\/)?(\d{5,})(?:\/|$)/,
    );
    if (fromPath) return fromPath[1];
    for (const key of ['v', 'story_fbid', 'fbid']) {
      const value = u.searchParams.get(key);
      if (value && /^\d{5,}$/.test(value)) return value;
    }
    return null;
  } catch {
    return null;
  }
}

/** The numeric pin id from `/pin/<id>/`, `/pin/<slug>--<id>/` and `/pin/<id>/sent/…`. `pin.it` links give null. */
export function extractPinterestId(url: string): string | null {
  try {
    const u = new URL(url);
    if (!isPinterestHost(u.hostname.toLowerCase().replace(/^www\./, ''))) return null;
    const match = u.pathname.match(/^\/pin\/(?:[^/]*--)?(\d{5,25})(?:\/|$)/);
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

  if (resolvedPlatform === 'facebook') {
    const inputId = extractFacebookId(inputUrl);
    const storedId = extractFacebookId(storedUrl);
    if (inputId && storedId) return inputId === storedId;
  }

  if (resolvedPlatform === 'pinterest') {
    const inputId = extractPinterestId(inputUrl);
    const storedId = extractPinterestId(storedUrl);
    if (inputId && storedId) return inputId === storedId;
  }

  return canonicalizeUrlForCompare(inputUrl) === canonicalizeUrlForCompare(storedUrl);
}

/** Stable compare form: no hash, no tracking params, no www, no trailing slash. */
export function canonicalizeUrlForCompare(url: string): string {
  try {
    const u = new URL(url.trim());
    u.hash = '';
    // Drop common tracking params for web recipe dedupe.
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|mc_|ref$)/i.test(key)) {
        u.searchParams.delete(key);
      }
    }
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
    let path = u.pathname;
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    u.pathname = path;
    return u.toString();
  } catch {
    return url.trim();
  }
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
    case 'facebook':
      return extractFacebookId(url);
    case 'pinterest':
      return extractPinterestId(url);
    default:
      return null;
  }
}
