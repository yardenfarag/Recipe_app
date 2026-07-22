import { describe, expect, it } from 'vitest';

import { getRecipePlatformLabel, getRecipeVideoInfo, recipeVideoEmbedHtml, youtubeWatchUrlAtSeconds } from './recipeVideo';

describe('getRecipeVideoInfo', () => {
  it('embeds YouTube watch URLs', () => {
    const info = getRecipeVideoInfo('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(info.mode).toBe('embed');
    expect(info.platform).toBe('youtube');
    expect(info.youtubeVideoId).toBe('dQw4w9WgXcQ');
    expect(info.embedUrl).toContain('embed/dQw4w9WgXcQ');
    expect(info.embedUrl).toContain('enablejsapi=1');
  });

  it('opens Instagram externally', () => {
    const url = 'https://www.instagram.com/reel/ABC123/';
    expect(getRecipeVideoInfo(url).mode).toBe('external');
    expect(getRecipeVideoInfo(url).platform).toBe('instagram');
  });

  it('opens TikTok externally', () => {
    const url = 'https://www.tiktok.com/@chef/video/123';
    expect(getRecipeVideoInfo(url).mode).toBe('external');
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

describe('recipeVideoEmbedHtml', () => {
  it('includes the embed iframe', () => {
    expect(recipeVideoEmbedHtml('https://example.com/embed/x')).toContain('<iframe');
    expect(recipeVideoEmbedHtml('https://example.com/embed/x')).toContain('https://example.com/embed/x');
    expect(recipeVideoEmbedHtml('https://example.com/embed/x')).toContain('enablejsapi=1');
  });
});

describe('youtubeWatchUrlAtSeconds', () => {
  it('builds a watch URL with start time', () => {
    expect(youtubeWatchUrlAtSeconds('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 134)).toBe(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=134',
    );
  });
});
