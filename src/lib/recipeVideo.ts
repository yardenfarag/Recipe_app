import Constants from 'expo-constants';
import type { Platform } from '@/types/recipe';

import {
  detectPlatform,
  extractInstagramId,
  extractTikTokId,
} from '@/lib/platformUrls';
import { extractYouTubeId } from '@/lib/youtube';

/** Mobile UA helps TikTok/Instagram pages load in WebView instead of 404/desktop blocks. */
export const VIDEO_WEBVIEW_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

export type RecipeVideoMode = 'webview' | 'none';

export type RecipeVideoInfo = {
  mode: RecipeVideoMode;
  url: string;
  platform: Platform;
  youtubeVideoId?: string;
};

/** Referer required by YouTube embeds in mobile WebViews (Error 153 without it). */
export const VIDEO_WEBVIEW_REFERER =
  Constants.expoConfig?.android?.package ??
  Constants.expoConfig?.ios?.bundleIdentifier ??
  'com.pinch.myapp';

export const VIDEO_WEBVIEW_REFERER_URL = `https://${VIDEO_WEBVIEW_REFERER}`;

export type RecipeVideoWebViewSource =
  | { type: 'uri'; uri: string; headers?: Record<string, string> }
  | { type: 'html'; html: string; baseUrl: string };

const PLATFORM_LABEL: Record<Platform, string> = {
  youtube: 'YouTube',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  unknown: 'Video',
};

export function getRecipePlatformLabel(platform: Platform): string {
  return PLATFORM_LABEL[platform] ?? 'Video';
}

/** Resolves how to show the source video for a saved/extracted recipe. */
export function getRecipeVideoInfo(
  originalUrl?: string | null,
  platformHint?: Platform | null,
): RecipeVideoInfo {
  const url = originalUrl?.trim() ?? '';
  if (!url) return { mode: 'none', url: '', platform: 'unknown' };

  const platform =
    platformHint && platformHint !== 'unknown' ? platformHint : detectPlatform(url);

  if (platform === 'youtube') {
    const youtubeVideoId = extractYouTubeId(url);
    return { mode: 'webview', url, platform: 'youtube', youtubeVideoId: youtubeVideoId ?? undefined };
  }

  if (platform === 'instagram' || platform === 'tiktok') {
    return { mode: 'webview', url, platform };
  }

  return { mode: 'webview', url, platform: platform === 'unknown' ? 'unknown' : platform };
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

/** Page URL for IG/TikTok when embed ids are unavailable (e.g. short links). */
export function recipeVideoWebViewPageUrl(
  originalUrl: string,
  platform: Platform,
  startSeconds?: number,
): string {
  if (platform === 'youtube') {
    if (startSeconds != null && startSeconds > 0) {
      return youtubeWatchUrlAtSeconds(originalUrl, startSeconds) ?? originalUrl;
    }
    return originalUrl;
  }
  if (startSeconds != null && startSeconds > 0) {
    return recipeVideoUrlAtSeconds(originalUrl, platform, startSeconds);
  }
  return originalUrl;
}

/** WebView source for cook-along modal — YouTube uses embed + Referer; others use page URL. */
export function buildRecipeVideoWebViewSource(
  info: RecipeVideoInfo,
  startSeconds?: number,
): RecipeVideoWebViewSource | null {
  if (info.mode === 'none' || !info.url) return null;

  if (info.platform === 'youtube' && info.youtubeVideoId) {
    const start =
      startSeconds != null && startSeconds > 0 ? `&start=${Math.round(startSeconds)}` : '';
    const origin = encodeURIComponent(VIDEO_WEBVIEW_REFERER_URL);
    const uri =
      `https://www.youtube.com/embed/${info.youtubeVideoId}` +
      `?enablejsapi=1&playsinline=1&rel=0&modestbranding=1&iv_load_policy=3` +
      `&origin=${origin}${start}`;
    return {
      type: 'uri',
      uri,
      headers: { Referer: VIDEO_WEBVIEW_REFERER_URL },
    };
  }

  if (info.platform === 'instagram') {
    const embedUrl = instagramEmbedUrl(info.url);
    if (embedUrl) {
      return {
        type: 'html',
        html: recipeVideoEmbedHtml(embedUrl),
        baseUrl: 'https://www.instagram.com',
      };
    }
  }

  if (info.platform === 'tiktok') {
    const embedUrl = tiktokEmbedUrl(info.url);
    if (embedUrl) {
      return {
        type: 'html',
        html: recipeVideoEmbedHtml(embedUrl),
        baseUrl: 'https://www.tiktok.com',
      };
    }
  }

  return {
    type: 'uri',
    uri: recipeVideoWebViewPageUrl(info.url, info.platform, startSeconds),
  };
}

/** @deprecated Inline embed HTML — use buildRecipeVideoWebViewSource in modal instead. */
export function recipeVideoEmbedHtml(embedUrl: string): string {
  const src = embedUrl.includes('enablejsapi=1')
    ? embedUrl
    : `${embedUrl}${embedUrl.includes('?') ? '&' : '?'}enablejsapi=1`;

  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<style>
  html, body { margin: 0; padding: 0; background: #000; height: 100%; overflow: hidden; }
  iframe { border: 0; width: 100%; height: 100%; }
</style>
</head>
<body>
  <iframe
    id="player"
    src="${src}"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
    allowfullscreen
    referrerpolicy="strict-origin-when-cross-origin"
  ></iframe>
</body>
</html>`;
}

/** @deprecated Seek via modal reload with startSeconds instead. */
export function buildYouTubeSeekScript(seconds: number): string {
  const clamped = Math.max(0, Math.round(seconds));
  return `(function() {
    var iframe = document.getElementById('player');
    if (!iframe || !iframe.contentWindow) return true;
    iframe.contentWindow.postMessage(
      JSON.stringify({ event: 'command', func: 'seekTo', args: [${clamped}, true] }),
      '*'
    );
    true;
  })();`;
}
