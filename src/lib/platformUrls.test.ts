import { describe, expect, it } from 'vitest';

import {
  detectPlatform,
  extractContentId,
  extractInstagramId,
  extractTikTokId,
  normalizeSocialUrl,
  recipeUrlsMatch,
} from '@/lib/platformUrls';

describe('normalizeSocialUrl', () => {
  it('extracts a URL from share-sheet text', () => {
    expect(
      normalizeSocialUrl('Try this recipe https://www.instagram.com/reel/CigMSGeD4Hd/ 🍝'),
    ).toBe('https://www.instagram.com/reel/CigMSGeD4Hd/');
  });

  it('adds https to supported scheme-less links', () => {
    expect(normalizeSocialUrl('youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
      'https://youtube.com/watch?v=dQw4w9WgXcQ',
    );
  });

  it('rejects unsupported and misleading hosts', () => {
    expect(normalizeSocialUrl('https://example.com/recipe')).toBeNull();
    expect(normalizeSocialUrl('https://youtube.com.evil.test/watch?v=abc')).toBeNull();
  });
});

describe('detectPlatform', () => {
  it('detects YouTube', () => {
    expect(detectPlatform('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('youtube');
  });

  it('detects Instagram', () => {
    expect(detectPlatform('https://www.instagram.com/reel/CigMSGeD4Hd/')).toBe('instagram');
  });

  it('detects TikTok', () => {
    expect(detectPlatform('https://www.tiktok.com/@chef/video/7499229683859426602')).toBe('tiktok');
  });

  it('detects TikTok short links', () => {
    expect(detectPlatform('https://vm.tiktok.com/ZMabcdef/')).toBe('tiktok');
  });
});

describe('extractInstagramId', () => {
  it('parses reel URLs', () => {
    expect(extractInstagramId('https://www.instagram.com/reel/CigMSGeD4Hd/')).toBe('CigMSGeD4Hd');
  });

  it('parses plural reels URLs', () => {
    expect(extractInstagramId('https://instagram.com/reels/CigMSGeD4Hd')).toBe('CigMSGeD4Hd');
  });

  it('parses post URLs', () => {
    expect(extractInstagramId('https://www.instagram.com/p/ABC123xyz/')).toBe('ABC123xyz');
  });
});

describe('extractTikTokId', () => {
  it('parses standard video URLs', () => {
    expect(extractTikTokId('https://www.tiktok.com/@chef/video/7499229683859426602')).toBe(
      '7499229683859426602',
    );
  });

  it('returns null for short links without id in path', () => {
    expect(extractTikTokId('https://vm.tiktok.com/ZMabcdef/')).toBeNull();
  });
});

describe('recipeUrlsMatch', () => {
  it('matches Instagram reel URL variants', () => {
    expect(
      recipeUrlsMatch(
        'https://www.instagram.com/reel/CigMSGeD4Hd/',
        'https://instagram.com/reels/CigMSGeD4Hd',
        'instagram',
      ),
    ).toBe(true);
  });

  it('matches TikTok video URLs with the same id', () => {
    expect(
      recipeUrlsMatch(
        'https://www.tiktok.com/@chef/video/7499229683859426602',
        'https://tiktok.com/@other/video/7499229683859426602',
        'tiktok',
      ),
    ).toBe(true);
  });

  it('does not match different Instagram posts', () => {
    expect(
      recipeUrlsMatch(
        'https://www.instagram.com/reel/AAAA1111/',
        'https://www.instagram.com/reel/BBBB2222/',
        'instagram',
      ),
    ).toBe(false);
  });
});

describe('extractContentId', () => {
  it('returns platform-specific ids', () => {
    expect(extractContentId('https://www.instagram.com/reel/ABC123/')).toBe('ABC123');
    expect(extractContentId('https://www.tiktok.com/@u/video/999')).toBe('999');
  });
});
