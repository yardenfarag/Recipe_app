// npx deno test -A --no-lock supabase/functions/_shared/facebook_test.ts

import { assertEquals } from 'jsr:@std/assert@1';

import {
  type FacebookPostResponse,
  facebookMetaFromResponse,
  looksLikeFacebookPost,
  resolveFacebookShareLink,
} from './facebook.ts';

// Shapes copied from live `GET /v1/facebook/post` responses (14 Nov 2026), with the content replaced.
const REEL: FacebookPostResponse = {
  post_id: '122147662305053414',
  shared_post_url: null,
  description: 'Three-ingredient banana pancakes\n\n1 cup oats\n2 ripe bananas\n2 eggs',
  url: 'https://www.facebook.com/reel/774239929117468',
  image_url: null,
  video: {
    id: '774239929117468',
    sd_url: 'https://video-lga3-3.xx.fbcdn.net/o1/v/t2/f2/m412/sd.mp4?oe=1',
    hd_url: 'https://video-lga3-2.xx.fbcdn.net/o1/v/t2/f2/m366/hd.mp4?oe=1',
    length_in_second: 20.766,
    thumbnail: 'https://scontent-lga3-1.xx.fbcdn.net/v/t15.5256-10/thumb.jpg',
  },
  author: { id: '61581602447007', name: 'Test Cook' },
  transcript: 'Blend one cup of oats into a fine flour, then add two bananas and two eggs.',
};

const PHOTO_POST: FacebookPostResponse = {
  post_id: '1582534293887922',
  shared_post_url: null,
  description: 'Red lentil soup\n\nIngredients:\n1 large onion\n1 grated tomato',
  url: 'https://www.facebook.com/100063940989830/posts/1582534293887922/?rdid=QVKQNzNbxoINq50Z&share_url=https%3A%2F%2Fwww.facebook.com%2Fshare%2F1CdgCUGMYG%2F',
  image_url: 'https://scontent-lga3-1.xx.fbcdn.net/v/t39.30808-6/photo.jpg',
  thumbnail: null,
  video: { id: null, sd_url: null, hd_url: null, length_in_second: null, thumbnail: null },
  author: { id: '100063940989830', name: 'Test Kitchen' },
  comments: [
    { text: 'How much water?', author: { id: 'pfbid02x2szSW12tsnCa', name: 'A Reader' } },
    { text: null, author: { id: 'pfbid035Bsu6dzchaWFG', name: 'Sticker Only' } },
    { text: '6 cups of water, sorry!', author: { id: 'pfbid0differentEncoding', name: 'test kitchen' } },
  ],
};

Deno.test('a reel maps to caption, transcript, SD video, and its reel id', () => {
  const meta = facebookMetaFromResponse(REEL, [], 'https://www.facebook.com/share/r/1HYN8d6iBk/');
  assertEquals(meta.description, REEL.description);
  assertEquals(meta.captions, REEL.transcript);
  assertEquals(meta.videoUrl, REEL.video!.sd_url);
  assertEquals(meta.thumbnailUrl, REEL.video!.thumbnail);
  assertEquals(meta.durationSeconds, 21);
  // The video id is the one in the reel's URL. `post_id` appears in no link.
  assertEquals(meta.contentId, '774239929117468');
  assertEquals(meta.canonicalUrl, 'https://www.facebook.com/reel/774239929117468');
  assertEquals(meta.topComments, []);
});

Deno.test('a reel falls back to the HD file when there is no SD one', () => {
  const meta = facebookMetaFromResponse(
    { ...REEL, video: { ...REEL.video, sd_url: null } },
    [],
    REEL.url!,
  );
  assertEquals(meta.videoUrl, REEL.video!.hd_url);
});

Deno.test('separately fetched comments are used for a reel, and the creator is flagged by name', () => {
  const meta = facebookMetaFromResponse(
    REEL,
    [
      { text: 'Looks great', author: { id: 'pfbid02bd3SGpKBD', name: 'A Viewer' } },
      { text: 'Full recipe: bake 12 minutes at 180C', author: { id: 'pfbid0zzz', name: 'Test Cook' } },
    ],
    REEL.url!,
  );
  assertEquals(meta.topComments, [
    { text: 'Looks great', isCreator: false },
    { text: 'Full recipe: bake 12 minutes at 180C', isCreator: true },
  ]);
});

Deno.test('a photo post maps to caption, photo, inline comments, and a clean post URL', () => {
  const meta = facebookMetaFromResponse(PHOTO_POST, [], 'https://www.facebook.com/share/1CdgCUGMYG/');
  assertEquals(meta.description, PHOTO_POST.description);
  assertEquals(meta.thumbnailUrl, PHOTO_POST.image_url);
  assertEquals(meta.videoUrl, undefined);
  assertEquals(meta.durationSeconds, undefined);
  assertEquals(meta.captions, undefined);
  assertEquals(meta.contentId, '1582534293887922');
  assertEquals(meta.canonicalUrl, 'https://www.facebook.com/100063940989830/posts/1582534293887922');
  // Empty (sticker) comments are dropped; the page's own reply is flagged despite the opaque id.
  assertEquals(meta.topComments, [
    { text: 'How much water?', isCreator: false },
    { text: '6 cups of water, sorry!', isCreator: true },
  ]);
});

Deno.test('a post behind an opaque pfbid link gets one address from its numeric ids', () => {
  const meta = facebookMetaFromResponse(
    { ...PHOTO_POST, url: 'https://www.facebook.com/testkitchen/posts/pfbid0aTzJhboid2YLrnUZrAfuMWBM2cVFdRn' },
    [],
    'https://www.facebook.com/share/p/1AbCdEfGhI/',
  );
  assertEquals(meta.contentId, '1582534293887922');
  assertEquals(meta.canonicalUrl, 'https://www.facebook.com/100063940989830/posts/1582534293887922');
});

Deno.test('at most ten comments are kept', () => {
  const many = Array.from({ length: 14 }, (_, i) => ({ text: `comment ${i}`, author: { name: 'x' } }));
  assertEquals(facebookMetaFromResponse(REEL, many, REEL.url!).topComments.length, 10);
});

Deno.test('looksLikeFacebookPost tells posts from videos and unknown share links', () => {
  for (const url of [
    'https://www.facebook.com/100063940989830/posts/1582534293887922/',
    'https://www.facebook.com/groups/123456789/permalink/987654321098/',
    'https://www.facebook.com/permalink.php?story_fbid=1582534293887922&id=100063940989830',
    'https://www.facebook.com/share/p/1AbCdEfGhI/',
    'https://www.facebook.com/photo/?fbid=1582533443888007',
  ]) {
    assertEquals(looksLikeFacebookPost(url), true, url);
  }
  for (const url of [
    'https://www.facebook.com/reel/774239929117468',
    'https://www.facebook.com/share/r/1HYN8d6iBk/',
    'https://www.facebook.com/share/1CdgCUGMYG/',
    'https://www.facebook.com/watch/?v=1535656380759655',
    'https://fb.watch/abCDef123_/',
  ]) {
    assertEquals(looksLikeFacebookPost(url), false, url);
  }
});

function redirectTo(location: string | null, status = 302): typeof fetch {
  return ((_input: string, init?: RequestInit) => {
    assertEquals(init?.redirect, 'manual');
    const headers = new Headers();
    if (location) headers.set('location', location);
    return Promise.resolve(new Response(null, { status, headers }));
  }) as typeof fetch;
}

Deno.test('a share link resolves to the clean reel URL', async () => {
  const resolved = await resolveFacebookShareLink(
    'https://www.facebook.com/share/r/1HYN8d6iBk/',
    redirectTo(
      'https://www.facebook.com/reel/774239929117468/?rdid=9teNTtQuXEjwEHdm&share_url=https%3A%2F%2Fwww.facebook.com%2Fshare%2Fr%2F1HYN8d6iBk%2F',
    ),
  );
  assertEquals(resolved, 'https://www.facebook.com/reel/774239929117468');
});

Deno.test('a share link resolves to the clean post URL', async () => {
  const resolved = await resolveFacebookShareLink(
    'https://www.facebook.com/share/1CdgCUGMYG/',
    redirectTo('https://www.facebook.com/100063940989830/posts/1582534293887922/?rdid=r3H3bnHXY148pVoU'),
  );
  assertEquals(resolved, 'https://www.facebook.com/100063940989830/posts/1582534293887922');
});

Deno.test('a share link that cannot be resolved comes back unchanged', async () => {
  const share = 'https://www.facebook.com/share/r/1ZZZZzzzz9/';
  // Unknown code: Facebook serves the login page with no redirect.
  assertEquals(await resolveFacebookShareLink(share, redirectTo(null, 200)), share);
  // fb.watch with an unknown code lands on the bare Watch tab.
  assertEquals(
    await resolveFacebookShareLink('https://fb.watch/abCDef123_/', redirectTo('https://www.facebook.com/watch/')),
    'https://fb.watch/abCDef123_/',
  );
  // Login wall.
  assertEquals(
    await resolveFacebookShareLink(share, redirectTo('https://www.facebook.com/login/?next=x')),
    share,
  );
  // A redirect off Facebook is never followed or trusted.
  assertEquals(
    await resolveFacebookShareLink(share, redirectTo('https://evil.example/reel/774239929117468')),
    share,
  );
  // Network failure.
  const failing = (() => Promise.reject(new Error('boom'))) as unknown as typeof fetch;
  assertEquals(await resolveFacebookShareLink(share, failing), share);
});

Deno.test('links that are not share links are not fetched', async () => {
  const neverCalled = (() => {
    throw new Error('should not fetch');
  }) as unknown as typeof fetch;
  const reel = 'https://www.facebook.com/reel/774239929117468';
  assertEquals(await resolveFacebookShareLink(reel, neverCalled), reel);
  const other = 'https://example.com/share/r/abc/';
  assertEquals(await resolveFacebookShareLink(other, neverCalled), other);
});
