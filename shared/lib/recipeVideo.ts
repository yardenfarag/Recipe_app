import type { Platform } from '../types/recipe';

import { detectPlatform, extractFacebookId, extractInstagramId, extractTikTokId } from './platformUrls';
import { extractYouTubeId } from './youtube';

/**
 * Which source video a recipe can play beside it (cook-along), and the players' URLs. Both apps use these: mobile
 * loads them in a WebView (src/lib/recipeVideo.ts adds the WebView parts), the web app in an iframe.
 */

export type RecipeVideoMode = 'webview' | 'none';

export type RecipeVideoInfo = {
  /** `webview`: there is a video to play. `none`: nothing to play (a photo, a web page without a video). */
  mode: RecipeVideoMode;
  url: string;
  platform: Platform;
  youtubeVideoId?: string;
};

const PLATFORM_LABEL: Record<Platform, string> = {
  youtube: 'YouTube',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  web: 'Website',
  photo: 'Photo',
  unknown: 'Video',
};

export function getRecipePlatformLabel(platform: Platform): string {
  return PLATFORM_LABEL[platform] ?? 'Video';
}

/** Resolves how to show the source video for a saved/extracted recipe. */
export function getRecipeVideoInfo(
  originalUrl?: string | null,
  platformHint?: Platform | null,
  sourceVideoUrl?: string | null,
): RecipeVideoInfo {
  const url = originalUrl?.trim() ?? '';
  if (!url) {
    return {
      mode: 'none',
      url: '',
      platform: platformHint === 'photo' ? 'photo' : 'unknown',
    };
  }

  const platform =
    platformHint && platformHint !== 'unknown' ? platformHint : detectPlatform(url);

  if (platform === 'photo') {
    return { mode: 'none', url: '', platform: 'photo' };
  }

  if (platform === 'web') {
    const embedded = sourceVideoUrl?.trim();
    if (!embedded) return { mode: 'none', url: '', platform: 'web' };
    const embeddedPlatform = detectPlatform(embedded);
    if (
      embeddedPlatform === 'youtube' ||
      embeddedPlatform === 'instagram' ||
      embeddedPlatform === 'tiktok'
    ) {
      return getRecipeVideoInfo(embedded, embeddedPlatform);
    }
    return { mode: 'none', url: '', platform: 'web' };
  }

  if (platform === 'youtube') {
    const youtubeVideoId = extractYouTubeId(url);
    return { mode: 'webview', url, platform: 'youtube', youtubeVideoId: youtubeVideoId ?? undefined };
  }

  if (platform === 'instagram' || platform === 'tiktok') {
    return { mode: 'webview', url, platform };
  }

  if (platform === 'facebook') {
    // Photo and text posts have nothing to play.
    return facebookEmbedUrl(url)
      ? { mode: 'webview', url, platform }
      : { mode: 'none', url: '', platform };
  }

  return { mode: 'none', url: '', platform: 'unknown' };
}

/** YouTube watch URL with start time (seconds). */
export function youtubeWatchUrlAtSeconds(originalUrl: string, seconds: number): string | null {
  const videoId = extractYouTubeId(originalUrl);
  if (!videoId) return null;
  const clamped = Math.max(0, Math.round(seconds));
  return `https://www.youtube.com/watch?v=${videoId}&t=${clamped}`;
}

/** Best-effort page URL with timestamp for external platforms. */
export function recipeVideoUrlAtSeconds(
  originalUrl: string,
  platform: Platform,
  seconds: number,
): string {
  const clamped = Math.max(0, Math.round(seconds));
  const youtube = youtubeWatchUrlAtSeconds(originalUrl, clamped);
  if (platform === 'youtube' && youtube) return youtube;

  try {
    const parsed = new URL(originalUrl);
    parsed.searchParams.set('t', String(clamped));
    return parsed.toString();
  } catch {
    return originalUrl;
  }
}

/** Instagram embed player — works in WebView without login (page URLs often 404). */
export function instagramEmbedUrl(originalUrl: string): string | null {
  const shortcode = extractInstagramId(originalUrl);
  if (!shortcode) return null;

  try {
    const path = new URL(originalUrl).pathname;
    const kindMatch = path.match(/\/(reel|reels|p|tv)\//);
    const kind =
      kindMatch?.[1] === 'reels' ? 'reel' : (kindMatch?.[1] as 'reel' | 'p' | 'tv' | undefined);
    const segment = kind ?? 'reel';
    return `https://www.instagram.com/${segment}/${shortcode}/embed/captioned/`;
  } catch {
    return `https://www.instagram.com/reel/${shortcode}/embed/captioned/`;
  }
}

/** TikTok embed player — guest-friendly; watch pages block in-app WebViews. */
export function tiktokEmbedUrl(originalUrl: string): string | null {
  const videoId = extractTikTokId(originalUrl);
  if (!videoId) return null;
  return `https://www.tiktok.com/embed/v2/${videoId}`;
}

/**
 * Facebook's embedded video player, which plays public reels and videos without a login.
 * Null for posts: only `/reel/`, `/videos/` and `/watch` links are videos.
 */
export function facebookEmbedUrl(originalUrl: string): string | null {
  const videoId = extractFacebookId(originalUrl);
  if (!videoId) return null;
  try {
    const { pathname } = new URL(originalUrl);
    if (!/\/(?:reel|videos)\/|^\/watch\/?$|^\/video\.php$/.test(pathname)) return null;
  } catch {
    return null;
  }
  const href = encodeURIComponent(`https://www.facebook.com/reel/${videoId}`);
  return `https://www.facebook.com/plugins/video.php?href=${href}&show_text=false`;
}
