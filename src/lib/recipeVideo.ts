import Constants from 'expo-constants';
import type { Platform } from '@shared/types/recipe';

import {
  facebookEmbedUrl,
  instagramEmbedUrl,
  recipeVideoUrlAtSeconds,
  tiktokEmbedUrl,
  youtubeWatchUrlAtSeconds,
  type RecipeVideoInfo,
} from '@shared/lib/recipeVideo';

// The platform-free parts live in shared/ (the web app's cook-along uses them too). Re-exported for existing importers.
export {
  facebookEmbedUrl,
  getRecipePlatformLabel,
  getRecipeVideoInfo,
  instagramEmbedUrl,
  recipeVideoUrlAtSeconds,
  tiktokEmbedUrl,
  youtubeWatchUrlAtSeconds,
} from '@shared/lib/recipeVideo';
export type { RecipeVideoInfo, RecipeVideoMode } from '@shared/lib/recipeVideo';

/** Mobile UA helps TikTok/Instagram pages load in WebView instead of 404/desktop blocks. */
export const VIDEO_WEBVIEW_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

/** Referer required by YouTube embeds in mobile WebViews (Error 153 without it). */
export const VIDEO_WEBVIEW_REFERER =
  Constants.expoConfig?.android?.package ??
  Constants.expoConfig?.ios?.bundleIdentifier ??
  'com.pinch.myapp';

export const VIDEO_WEBVIEW_REFERER_URL = `https://${VIDEO_WEBVIEW_REFERER}`;

export type RecipeVideoWebViewSource =
  | { type: 'uri'; uri: string; headers?: Record<string, string> }
  | { type: 'html'; html: string; baseUrl: string };

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

/** WebView source for cook-along sheet — YouTube/IG/TikTok prefer embeds over watch pages. */
export function buildRecipeVideoWebViewSource(
  info: RecipeVideoInfo,
  startSeconds?: number,
): RecipeVideoWebViewSource | null {
  if (info.mode === 'none' || !info.url) return null;

  if (info.platform === 'youtube' && info.youtubeVideoId) {
    const start =
      startSeconds != null && startSeconds > 0 ? `&start=${Math.round(startSeconds)}` : '';
    const origin = encodeURIComponent(VIDEO_WEBVIEW_REFERER_URL);
    const embedUrl =
      `https://www.youtube.com/embed/${info.youtubeVideoId}` +
      `?enablejsapi=1&playsinline=1&rel=0&modestbranding=1&iv_load_policy=3` +
      `&origin=${origin}${start}`;
    // HTML wrapper is more reliable than raw URI on some iOS WebViews (Error 153).
    return {
      type: 'html',
      html: recipeVideoEmbedHtml(embedUrl, VIDEO_WEBVIEW_REFERER_URL),
      baseUrl: VIDEO_WEBVIEW_REFERER_URL,
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

  if (info.platform === 'facebook') {
    const embedUrl = facebookEmbedUrl(info.url);
    if (embedUrl) {
      return {
        type: 'html',
        html: recipeVideoEmbedHtml(embedUrl),
        baseUrl: 'https://www.facebook.com',
      };
    }
  }

  return {
    type: 'uri',
    uri: recipeVideoWebViewPageUrl(info.url, info.platform, startSeconds),
  };
}

/** Inline embed HTML for cook-along WebView. */
export function recipeVideoEmbedHtml(embedUrl: string, referrer?: string): string {
  const src = embedUrl.includes('enablejsapi=1')
    ? embedUrl
    : `${embedUrl}${embedUrl.includes('?') ? '&' : '?'}enablejsapi=1`;
  const referrerMeta = referrer
    ? `<meta name="referrer" content="origin">`
    : `<meta name="referrer" content="strict-origin-when-cross-origin">`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
${referrerMeta}
<style>
  html, body { margin: 0; padding: 0; background: #000; height: 100%; width: 100%; overflow: hidden; }
  iframe { border: 0; width: 100%; height: 100%; }
</style>
</head>
<body>
  <iframe
    id="player"
    src="${src}"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
    allowfullscreen
    playsinline
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
