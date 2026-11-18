// npx deno test -A --no-lock supabase/functions/_shared/platform_test.ts

import { assertEquals } from 'jsr:@std/assert@1';

import {
  canonicalFacebookUrl,
  detectPlatform,
  extractFacebookId,
  isFacebookShareLink,
  LIVE_PLATFORMS,
  recipeUrlsMatch,
} from './platform.ts';

Deno.test('Facebook imports are live', () => {
  assertEquals(LIVE_PLATFORMS.includes('facebook'), true);
});

Deno.test('extractFacebookId reads the numeric id from reel, video and post URLs', () => {
  const cases: Array<[string, string | null]> = [
    ['https://www.facebook.com/reel/774239929117468', '774239929117468'],
    ['https://www.facebook.com/reel/774239929117468/?rdid=abc&share_url=x', '774239929117468'],
    ['https://www.facebook.com/watch/?v=1535656380759655', '1535656380759655'],
    ['https://m.facebook.com/video.php?v=1535656380759655', '1535656380759655'],
    ['https://www.facebook.com/somepage/videos/1535656380759655/', '1535656380759655'],
    ['https://www.facebook.com/somepage/videos/lentil-soup/1535656380759655/', '1535656380759655'],
    ['https://www.facebook.com/100063940989830/posts/1582534293887922/', '1582534293887922'],
    ['https://www.facebook.com/groups/123456789/posts/987654321098/', '987654321098'],
    ['https://www.facebook.com/groups/123456789/permalink/987654321098/', '987654321098'],
    [
      'https://www.facebook.com/permalink.php?story_fbid=1582534293887922&id=100063940989830',
      '1582534293887922',
    ],
    ['https://www.facebook.com/photo/?fbid=1582533443888007&set=a.1', '1582533443888007'],
    // Opaque: the id only comes back from the fetched post.
    ['https://www.facebook.com/share/r/1HYN8d6iBk/', null],
    ['https://www.facebook.com/share/1CdgCUGMYG/', null],
    ['https://fb.watch/abCDef123_/', null],
    ['https://www.facebook.com/somepage/posts/pfbid0aTzJhboid2YLrnUZrAfuMWBM2cVFdRn', null],
    ['https://www.facebook.com/crispykitchens', null],
    ['not a url', null],
  ];
  for (const [url, id] of cases) assertEquals(extractFacebookId(url), id, url);
});

Deno.test('isFacebookShareLink spots share links and fb.watch', () => {
  assertEquals(isFacebookShareLink('https://www.facebook.com/share/r/1HYN8d6iBk/'), true);
  assertEquals(isFacebookShareLink('https://www.facebook.com/share/1CdgCUGMYG/'), true);
  assertEquals(isFacebookShareLink('https://fb.watch/abCDef123_/'), true);
  assertEquals(isFacebookShareLink('https://www.facebook.com/reel/774239929117468'), false);
});

Deno.test('canonicalFacebookUrl drops tracking and keeps what names the post', () => {
  assertEquals(
    canonicalFacebookUrl(
      'https://www.facebook.com/reel/774239929117468/?rdid=9teNTtQuXEjwEHdm&share_url=https%3A%2F%2Fwww.facebook.com%2Fshare%2Fr%2F1HYN8d6iBk%2F',
    ),
    'https://www.facebook.com/reel/774239929117468',
  );
  assertEquals(
    canonicalFacebookUrl('https://m.facebook.com/100063940989830/posts/1582534293887922/?mibextid=wwXIfr#x'),
    'https://www.facebook.com/100063940989830/posts/1582534293887922',
  );
  assertEquals(
    canonicalFacebookUrl('http://facebook.com/watch/?v=1535656380759655&fs=e'),
    'https://www.facebook.com/watch/?v=1535656380759655',
  );
});

Deno.test('recipeUrlsMatch matches Facebook links by id', () => {
  const savedReel = 'https://www.facebook.com/reel/774239929117468';
  // A share link has no id, so the id resolved from the post is passed in.
  assertEquals(
    recipeUrlsMatch('https://www.facebook.com/share/r/1HYN8d6iBk/', '774239929117468', savedReel, 'facebook'),
    true,
  );
  assertEquals(
    recipeUrlsMatch('https://m.facebook.com/watch/?v=774239929117468', null, savedReel, 'facebook'),
    true,
  );
  assertEquals(
    recipeUrlsMatch('https://www.facebook.com/reel/1773253387059978', null, savedReel, 'facebook'),
    false,
  );
  // An unresolved share link never matches a saved reel.
  assertEquals(
    recipeUrlsMatch('https://www.facebook.com/share/r/1HYN8d6iBk/', null, savedReel, 'facebook'),
    false,
  );
  // The same share link saved as-is (id unknown) still matches itself.
  assertEquals(
    recipeUrlsMatch(
      'https://www.facebook.com/share/r/1HYN8d6iBk/?mibextid=wwXIfr',
      null,
      'https://www.facebook.com/share/r/1HYN8d6iBk',
      'facebook',
    ),
    true,
  );
  // A Facebook reel is never matched against a saved Instagram reel with another shortcode.
  assertEquals(
    recipeUrlsMatch(savedReel, '774239929117468', 'https://www.instagram.com/reel/CigMSGeD4Hd/', 'instagram'),
    false,
  );
});

Deno.test('detectPlatform recognizes Facebook hosts (PIN-66)', () => {
  for (const url of [
    'https://www.facebook.com/share/r/1HYN8d6iBk/',
    'https://www.facebook.com/share/1CdgCUGMYG/',
    'https://www.facebook.com/share/r/1A1xoSSih7/?mibextid=wwXIfr',
    'https://facebook.com/reel/1234567890123456',
    'https://m.facebook.com/watch/?v=1234567890123456',
    'https://web.facebook.com/somepage/videos/1234567890123456/',
    'https://fb.watch/abCDef123_/',
    'HTTPS://WWW.FACEBOOK.COM/share/v/1AbCdEfGhI/',
  ]) {
    assertEquals(detectPlatform(url), 'facebook', url);
  }
});

Deno.test('detectPlatform does not mistake lookalike hosts for Facebook', () => {
  assertEquals(detectPlatform('https://notfacebook.com/reel/1'), 'web');
  assertEquals(detectPlatform('https://facebook.com.evil.example/reel/1'), 'web');
  assertEquals(detectPlatform('https://fb.watch.example.com/abc'), 'web');
});

Deno.test('detectPlatform keeps the existing platforms', () => {
  assertEquals(detectPlatform('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'youtube');
  assertEquals(detectPlatform('https://www.instagram.com/reel/CigMSGeD4Hd/'), 'instagram');
  assertEquals(detectPlatform('https://vm.tiktok.com/ZMabcdef/'), 'tiktok');
  assertEquals(detectPlatform('https://www.allrecipes.com/recipe/21151/'), 'web');
  assertEquals(detectPlatform('ftp://facebook.com/reel/1'), 'unknown');
  assertEquals(detectPlatform('not a url'), 'unknown');
});
