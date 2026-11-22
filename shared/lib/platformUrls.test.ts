import { describe, expect, it } from 'vitest';

import {
  detectPlatform,
  extractContentId,
  extractFacebookId,
  extractInstagramId,
  extractPinterestId,
  extractTikTokId,
  normalizeSocialUrl,
  recipeUrlsMatch,
} from './platformUrls';

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

  it('adds https to scheme-less Facebook links', () => {
    expect(normalizeSocialUrl('Look at this fb.watch/abCDef123_/')).toBe('https://fb.watch/abCDef123_/');
    expect(normalizeSocialUrl('www.facebook.com/share/r/1HYN8d6iBk/')).toBe(
      'https://www.facebook.com/share/r/1HYN8d6iBk/',
    );
  });

  it('accepts recipe website URLs', () => {
    expect(normalizeSocialUrl('https://www.allrecipes.com/recipe/21151/simple-roast-chicken/')).toBe(
      'https://www.allrecipes.com/recipe/21151/simple-roast-chicken/',
    );
  });

  it('rejects localhost and non-http schemes', () => {
    expect(normalizeSocialUrl('https://localhost/recipe')).toBeNull();
    expect(normalizeSocialUrl('ftp://example.com/recipe')).toBeNull();
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

  it('detects Facebook share links, reels and fb.watch (PIN-66)', () => {
    for (const url of [
      'https://www.facebook.com/share/r/1HYN8d6iBk/',
      'https://www.facebook.com/share/1CdgCUGMYG/',
      'https://www.facebook.com/share/r/1A1xoSSih7/?mibextid=wwXIfr',
      'https://m.facebook.com/watch/?v=1234567890123456',
      'https://fb.watch/abCDef123_/',
    ]) {
      expect(detectPlatform(url)).toBe('facebook');
    }
  });

  it('does not mistake lookalike hosts for Facebook', () => {
    expect(detectPlatform('https://notfacebook.com/reel/1')).toBe('web');
    expect(detectPlatform('https://facebook.com.evil.example/reel/1')).toBe('web');
  });

  it('detects recipe websites as web', () => {
    expect(detectPlatform('https://www.foodnetwork.com/recipes/ina-garten/roast-chicken')).toBe(
      'web',
    );
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

describe('extractFacebookId', () => {
  it('parses reel, video and post URLs', () => {
    expect(extractFacebookId('https://www.facebook.com/reel/774239929117468')).toBe('774239929117468');
    expect(extractFacebookId('https://m.facebook.com/watch/?v=1535656380759655')).toBe(
      '1535656380759655',
    );
    expect(extractFacebookId('https://www.facebook.com/somepage/videos/1535656380759655/')).toBe(
      '1535656380759655',
    );
    expect(
      extractFacebookId('https://www.facebook.com/100063940989830/posts/1582534293887922/'),
    ).toBe('1582534293887922');
  });

  it('returns null for share links, which carry no id', () => {
    expect(extractFacebookId('https://www.facebook.com/share/r/1HYN8d6iBk/')).toBeNull();
    expect(extractFacebookId('https://fb.watch/abCDef123_/')).toBeNull();
  });
});

describe('recipeUrlsMatch', () => {
  it('matches Facebook reel links with the same id', () => {
    expect(
      recipeUrlsMatch(
        'https://m.facebook.com/watch/?v=774239929117468',
        'https://www.facebook.com/reel/774239929117468',
        'facebook',
      ),
    ).toBe(true);
    expect(
      recipeUrlsMatch(
        'https://www.facebook.com/reel/1773253387059978',
        'https://www.facebook.com/reel/774239929117468',
        'facebook',
      ),
    ).toBe(false);
  });

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
    expect(extractContentId('https://www.facebook.com/reel/774239929117468')).toBe('774239929117468');
  });
});

describe('Pinterest (PIN-70)', () => {
  it('pulls a pin.it link out of the Pinterest app share text', () => {
    expect(normalizeSocialUrl('Check out this Pin on Pinterest https://pin.it/53posxf7Z')).toBe(
      'https://pin.it/53posxf7Z',
    );
    expect(normalizeSocialUrl('pin.it/53posxf7Z')).toBe('https://pin.it/53posxf7Z');
    expect(normalizeSocialUrl('uk.pinterest.com/pin/521713938098528836/')).toBe(
      'https://uk.pinterest.com/pin/521713938098528836/',
    );
  });

  it('detects Pinterest, its country domains and pin.it, and nothing that only looks like it', () => {
    for (const url of [
      'https://www.pinterest.com/pin/452611831329517145/',
      'https://uk.pinterest.com/pin/521713938098528836/',
      'https://www.pinterest.co.uk/pin/521713938098528836/',
      'https://www.pinterest.com.au/pin/521713938098528836/',
      'https://www.pinterest.de/pin/521713938098528836/',
      'https://pin.it/53posxf7Z',
    ]) {
      expect(detectPlatform(url)).toBe('pinterest');
    }
    expect(detectPlatform('https://notpinterest.com/pin/1234567/')).toBe('web');
    expect(detectPlatform('https://pinterest.com.evil.example/pin/1234567/')).toBe('web');
  });

  it('reads the pin id from every pin URL shape', () => {
    expect(extractPinterestId('https://www.pinterest.com/pin/452611831329517145/')).toBe('452611831329517145');
    expect(
      extractPinterestId('https://www.pinterest.com/pin/one-pot-toblerone-cheesecake--521713938098528836/'),
    ).toBe('521713938098528836');
    expect(
      extractPinterestId('https://www.pinterest.ru/pin/474707616995081285/sent/?invite_code=x&sender=y&sfo=1'),
    ).toBe('474707616995081285');
    expect(extractPinterestId('https://pin.it/53posxf7Z')).toBeNull();
    expect(extractPinterestId('https://www.pinterest.com/someone/soups/')).toBeNull();
    expect(extractPinterestId('https://example.com/pin/452611831329517145/')).toBeNull();
    expect(extractContentId('https://uk.pinterest.com/pin/521713938098528836/')).toBe('521713938098528836');
  });

  it('matches one pin across URL shapes, and not two different pins', () => {
    const saved = 'https://www.pinterest.com/pin/521713938098528836/';
    expect(recipeUrlsMatch('https://uk.pinterest.com/pin/cake--521713938098528836/', saved, 'pinterest')).toBe(true);
    expect(recipeUrlsMatch('https://www.pinterest.com/pin/452611831329517145/', saved, 'pinterest')).toBe(false);
  });
});
