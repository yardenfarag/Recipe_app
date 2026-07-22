import type { Platform } from '@/types/recipe';

import { detectPlatform } from '@/lib/platformUrls';
import { extractYouTubeId } from '@/lib/youtube';

export type RecipeVideoMode = 'embed' | 'external' | 'none';

export type RecipeVideoInfo = {
  mode: RecipeVideoMode;
  url: string;
  platform: Platform;
  youtubeVideoId?: string;
  embedUrl?: string;
};

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
    if (!youtubeVideoId) {
      return { mode: 'external', url, platform: 'youtube' };
    }
    const embedUrl = `https://www.youtube.com/embed/${youtubeVideoId}?enablejsapi=1&playsinline=1&rel=0&modestbranding=1&iv_load_policy=3`;
    return { mode: 'embed', url, platform: 'youtube', youtubeVideoId, embedUrl };
  }

  if (platform === 'instagram' || platform === 'tiktok') {
    return { mode: 'external', url, platform };
  }

  return { mode: 'external', url, platform: platform === 'unknown' ? 'unknown' : platform };
}

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

/** JS injected into the YouTube embed WebView to seek playback. */
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

/** YouTube watch URL with start time (seconds). */
export function youtubeWatchUrlAtSeconds(originalUrl: string, seconds: number): string | null {
  const videoId = extractYouTubeId(originalUrl);
  if (!videoId) return null;
  const clamped = Math.max(0, Math.round(seconds));
  return `https://www.youtube.com/watch?v=${videoId}&t=${clamped}`;
}

/** Best-effort deep link with timestamp for external platforms. */
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
