import { describe, expect, it } from 'vitest';

import {
  buildRecipeVideoWebViewSource,
  getRecipeVideoInfo,
  instagramEmbedUrl,
  tiktokEmbedUrl,
  VIDEO_WEBVIEW_REFERER_URL,
} from './recipeVideo';

// The platform-free helpers (getRecipeVideoInfo, the embed URLs) are tested in shared/lib/recipeVideo.test.ts.

describe('buildRecipeVideoWebViewSource', () => {
  it('wraps YouTube embeds in HTML with start time', () => {
    const info = getRecipeVideoInfo('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    const source = buildRecipeVideoWebViewSource(info, 30);
    expect(source?.type).toBe('html');
    if (source?.type === 'html') {
      expect(source.html).toContain('embed/dQw4w9WgXcQ');
      expect(source.html).toContain('start=30');
      expect(source.baseUrl).toBe(VIDEO_WEBVIEW_REFERER_URL);
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


describe('facebook cook-along source', () => {
  it('loads the Facebook player in the cook-along sheet', () => {
    const source = buildRecipeVideoWebViewSource(
      getRecipeVideoInfo('https://www.facebook.com/reel/774239929117468', 'facebook'),
    );
    expect(source?.type).toBe('html');
    if (source?.type === 'html') {
      expect(source.html).toContain('facebook.com/plugins/video.php?href=');
      expect(source.baseUrl).toBe('https://www.facebook.com');
    }
  });
});

