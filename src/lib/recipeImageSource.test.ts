import { describe, expect, it } from 'vitest';

import { recipeImageSource } from '@/lib/recipeImageSource';

/** Mirrors cover priority in supabase/functions/_shared/tiktokThumbnail.ts */
function pickTikTokCover(video: Record<string, unknown>): string | undefined {
  const fields = ['cover', 'dynamic_cover', 'origin_cover', 'ai_dynamic_cover', 'animated_cover'];
  for (const key of fields) {
    const value = video[key];
    if (value && typeof value === 'object' && Array.isArray((value as { url_list?: string[] }).url_list)) {
      const url = (value as { url_list: string[] }).url_list[0];
      if (url) return url;
    }
  }
  return undefined;
}

describe('pickTikTokCover', () => {
  it('prefers cover then dynamic_cover', () => {
    expect(
      pickTikTokCover({
        dynamic_cover: { url_list: ['https://cdn.example/dynamic.jpg'] },
        origin_cover: { url_list: ['https://cdn.example/origin.jpg'] },
      }),
    ).toBe('https://cdn.example/dynamic.jpg');

    expect(
      pickTikTokCover({
        cover: { url_list: ['https://cdn.example/cover.jpg'] },
        dynamic_cover: { url_list: ['https://cdn.example/dynamic.jpg'] },
      }),
    ).toBe('https://cdn.example/cover.jpg');
  });
});

describe('recipeImageSource', () => {
  it('adds Referer for TikTok CDN URLs', () => {
    const source = recipeImageSource('https://p16-sign.tiktokcdn-us.com/thumb.jpg');
    expect(source).toMatchObject({
      uri: 'https://p16-sign.tiktokcdn-us.com/thumb.jpg',
      headers: { Referer: 'https://www.tiktok.com/' },
    });
  });

  it('adds Referer for Instagram CDN URLs', () => {
    const source = recipeImageSource(
      'https://scontent.cdninstagram.com/v/t51.2885-15/example.jpg',
    );
    expect(source).toMatchObject({
      headers: { Referer: 'https://www.instagram.com/' },
    });
  });

  it('leaves YouTube URLs unchanged', () => {
    const uri = 'https://i.ytimg.com/vi/abc/mqdefault.jpg';
    expect(recipeImageSource(uri)).toEqual({ uri });
  });
});
