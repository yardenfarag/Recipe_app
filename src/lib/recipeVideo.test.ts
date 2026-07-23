import { describe, expect, it } from 'vitest';

import {
  buildRecipeVideoWebViewSource,
  getRecipePlatformLabel,
  getRecipeVideoInfo,
  instagramEmbedUrl,
  tiktokEmbedUrl,
  VIDEO_WEBVIEW_REFERER_URL,
  youtubeWatchUrlAtSeconds,
} from './recipeVideo';

describe('getRecipeVideoInfo', () => {
  it('uses in-app webview for YouTube watch URLs', () => {
    const info = getRecipeVideoInfo('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(info.mode).toBe('webview');
    expect(info.platform).toBe('youtube');
    expect(info.youtubeVideoId).toBe('dQw4w9WgXcQ');
  });

  it('uses in-app webview for Instagram', () => {
    const url = 'https://www.instagram.com/reel/ABC123/';
    expect(getRecipeVideoInfo(url).mode).toBe('webview');
    expect(getRecipeVideoInfo(url).platform).toBe('instagram');
  });

  it('uses in-app webview for TikTok', () => {
    const url = 'https://www.tiktok.com/@chef/video/123';
    expect(getRecipeVideoInfo(url).mode).toBe('webview');
    expect(getRecipeVideoInfo(url).platform).toBe('tiktok');
  });

  it('returns none without a URL', () => {
    expect(getRecipeVideoInfo(undefined).mode).toBe('none');
  });
});

describe('getRecipePlatformLabel', () => {
  it('labels platforms for UI copy', () => {
    expect(getRecipePlatformLabel('youtube')).toBe('YouTube');
    expect(getRecipePlatformLabel('tiktok')).toBe('TikTok');
  });
});

describe('buildRecipeVideoWebViewSource', () => {
  it('adds referer headers for YouTube embeds', () => {
    const info = getRecipeVideoInfo('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    const source = buildRecipeVideoWebViewSource(info, 30);
    expect(source?.type).toBe('uri');
    if (source?.type === 'uri') {
      expect(source.uri).toContain('embed/dQw4w9WgXcQ');
      expect(source.uri).toContain('start=30');
      expect(source.headers?.Referer).toBe(VIDEO_WEBVIEW_REFERER_URL);
    }
  });

  it('loads TikTok embed iframe instead of watch page', () => {
    const url = 'https://www.tiktok.com/@chef/video/1234567890';
    const source = buildRecipeVideoWebViewSource(getRecipeVideoInfo(url));
    expect(source?.type).toBe('html');
    if (source?.type === 'html') {
      expect(source.html).toContain('tiktok.com/embed/v2/1234567890');
      expect(source.baseUrl).toBe('https://www.tiktok.com');
    }
    expect(tiktokEmbedUrl(url)).toBe('https://www.tiktok.com/embed/v2/1234567890');
  });

  it('loads Instagram embed iframe instead of reel page', () => {
    const url = 'https://www.instagram.com/reel/ABC123/';
    const source = buildRecipeVideoWebViewSource(getRecipeVideoInfo(url));
    expect(source?.type).toBe('html');
    if (source?.type === 'html') {
      expect(source.html).toContain('instagram.com/reel/ABC123/embed/captioned/');
      expect(source.baseUrl).toBe('https://www.instagram.com');
    }
    expect(instagramEmbedUrl(url)).toBe(
      'https://www.instagram.com/reel/ABC123/embed/captioned/',
    );
  });
});

describe('youtubeWatchUrlAtSeconds', () => {
  it('builds a watch URL with start time', () => {
    expect(youtubeWatchUrlAtSeconds('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 134)).toBe(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=134',
    );
  });
});
