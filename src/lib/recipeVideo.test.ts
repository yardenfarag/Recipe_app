import { describe, expect, it } from 'vitest';

import {
  buildRecipeVideoWebViewSource,
  facebookEmbedUrl,
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

  it('uses in-app webview for a Facebook reel (PIN-66)', () => {
    const info = getRecipeVideoInfo('https://www.facebook.com/reel/774239929117468', 'facebook');
    expect(info.mode).toBe('webview');
    expect(info.platform).toBe('facebook');
  });

  it('has nothing to play for a Facebook photo or text post', () => {
    const info = getRecipeVideoInfo(
      'https://www.facebook.com/100063940989830/posts/1582534293887922',
      'facebook',
    );
    expect(info.mode).toBe('none');
    expect(info.platform).toBe('facebook');
  });

  it('returns none without a URL', () => {
    expect(getRecipeVideoInfo(undefined).mode).toBe('none');
  });

  it('hides cook-along for web recipes without an embedded video', () => {
    const info = getRecipeVideoInfo(
      'https://www.allrecipes.com/recipe/21151/chicken/',
      'web',
    );
    expect(info.mode).toBe('none');
    expect(info.platform).toBe('web');
  });

  it('uses an embedded YouTube video for web cook-along', () => {
    const info = getRecipeVideoInfo(
      'https://www.allrecipes.com/recipe/21151/chicken/',
      'web',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    );
    expect(info.mode).toBe('webview');
    expect(info.platform).toBe('youtube');
    expect(info.youtubeVideoId).toBe('dQw4w9WgXcQ');
  });
});

describe('getRecipePlatformLabel', () => {
  it('labels platforms for UI copy', () => {
    expect(getRecipePlatformLabel('youtube')).toBe('YouTube');
    expect(getRecipePlatformLabel('tiktok')).toBe('TikTok');
    expect(getRecipePlatformLabel('web')).toBe('Website');
  });
});

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

describe('facebookEmbedUrl', () => {
  it('builds the embedded player URL for reels and videos', () => {
    const embed =
      'https://www.facebook.com/plugins/video.php?href=https%3A%2F%2Fwww.facebook.com%2Freel%2F774239929117468&show_text=false';
    expect(facebookEmbedUrl('https://www.facebook.com/reel/774239929117468')).toBe(embed);
    expect(facebookEmbedUrl('https://m.facebook.com/watch/?v=774239929117468')).toBe(embed);
    expect(facebookEmbedUrl('https://www.facebook.com/somepage/videos/774239929117468/')).toBe(embed);
  });

  it('returns null for posts and share links', () => {
    expect(
      facebookEmbedUrl('https://www.facebook.com/100063940989830/posts/1582534293887922'),
    ).toBeNull();
    expect(facebookEmbedUrl('https://www.facebook.com/share/r/1HYN8d6iBk/')).toBeNull();
    expect(facebookEmbedUrl('https://www.facebook.com/photo/?fbid=1582533443888007')).toBeNull();
  });

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

describe('youtubeWatchUrlAtSeconds', () => {
  it('builds a watch URL with start time', () => {
    expect(youtubeWatchUrlAtSeconds('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 134)).toBe(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=134',
    );
  });
});
