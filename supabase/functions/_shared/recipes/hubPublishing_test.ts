// npx deno test -A --no-lock supabase/functions/_shared/recipes/hubPublishing_test.ts
//
// What may become a public Hub card (PIN-153): only plain public links, no links in the text,
// only after the moderation check, never a hidden card, and only our own copy of a web image.

import { assert, assertEquals } from 'jsr:@std/assert@1';

import type { Db } from '../core/supabaseAdmin.ts';
import {
  buildModerationUserText,
  type ModerationResult,
  readModerationAnswer,
  stripLinks,
  stripRecipeLinks,
} from './hubModeration.ts';
import { hubWebUrl } from './hubSourceUrl.ts';
import {
  findRecipeCard,
  type HubRecipeSnapshot,
  hubImageUrl,
  publishRecipeCard,
  recipeCardCanonicalKey,
} from './recipeCards.ts';
import type { DrawRecipeImageResult } from './recipeImage.ts';

// Links that may be published ------------------------------------------------------------------

Deno.test('a plain public page keeps the address it always had', () => {
  assertEquals(hubWebUrl('https://www.Example.com/recipes/best-pancakes/'), 'https://example.com/recipes/best-pancakes');
  assertEquals(
    hubWebUrl('https://example.com/recipes/pancakes?utm_source=news&fbclid=abc&ref=home#comments'),
    'https://example.com/recipes/pancakes',
  );
  // What search results, ads and share buttons add is dropped, not mistaken for a key.
  assertEquals(
    hubWebUrl('https://example.com/pancakes?srsltid=AfmBOoq1&gad_source=1&gbraid=x&igsh=abc&_gl=1*2&mc_cid=9&pk_campaign=a'),
    'https://example.com/pancakes',
  );
  // Sites without pretty addresses name the page in a parameter.
  assertEquals(hubWebUrl('https://blog.example.com/?p=1234'), 'https://blog.example.com/?p=1234');
  assertEquals(hubWebUrl('https://example.co.il/recipe.php?id=77&lang=he'), 'https://example.co.il/recipe.php?id=77&lang=he');
  // Long lower-case slugs with a number are names, not keys.
  assertEquals(
    hubWebUrl('https://example.com/the-best-ever-one-pot-chicken-and-rice-recipe-2024-edition'),
    'https://example.com/the-best-ever-one-pot-chicken-and-rice-recipe-2024-edition',
  );
});

Deno.test('a link with a private key, or to a document or chat, is not for the Hub', () => {
  const notPublic = [
    'https://docs.google.com/document/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit',
    'https://drive.google.com/file/d/abc/view?usp=sharing',
    'https://www.dropbox.com/s/abc123/recipe.pdf?dl=0',
    'https://mycompany.sharepoint.com/sites/kitchen/recipe.aspx',
    'https://www.notion.so/My-recipe-0123456789abcdef0123456789abcdef',
    'https://chatgpt.com/share/6741-aaaa',
    'https://claude.ai/share/abc',
    // Any parameter we don't know could be the key.
    'https://example.com/recipe?token=s3cr3t',
    'https://example.com/recipe?id=5&share_key=s3cr3t',
    'https://example.com/view?doc=PRIVATE',
    'https://bucket.s3.amazonaws.com/recipe.html?X-Amz-Signature=abc',
    // A key in the path.
    'https://example.com/shared/1BxiMVs0XRA5nFMdKvBdBZjgmUU',
    'https://example.com/r/0123456789abcdef0123456789abcdef',
    'https://example.com/r/01234567-89ab-cdef-0123-456789abcdef',
    // Not an ordinary public site.
    'https://user:pass@example.com/recipe',
    'https://example.com:8443/recipe',
    'http://192.168.1.10/recipe',
    'http://localhost/recipe',
    'ftp://example.com/recipe',
    'not a url',
    '',
  ];
  for (const url of notPublic) assertEquals(hubWebUrl(url), null, url);
});

Deno.test('a link that is not for the Hub has no card key, so it is neither published nor matched', () => {
  assertEquals(recipeCardCanonicalKey('web', 'https://example.com/view?doc=PRIVATE'), null);
  assertEquals(recipeCardCanonicalKey('web', 'https://example.com/view?doc=OTHER'), null);
  assertEquals(recipeCardCanonicalKey('web', 'https://www.example.com/pancakes/?utm_source=x'), 'web:https://example.com/pancakes');
  // Video platforms are keyed by their content id, as before.
  assertEquals(recipeCardCanonicalKey('youtube', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5'), 'youtube:dQw4w9WgXcQ');
});

// Links in the text ----------------------------------------------------------------------------

Deno.test('links are removed from text, and ordinary cooking text is left alone', () => {
  assertEquals(stripLinks('Buy the pan at https://shop.example/pan?aff=1 today'), 'Buy the pan at today');
  assertEquals(stripLinks('Full recipe: www.example.com/pancakes.'), 'Full recipe:');
  assertEquals(stripLinks('More on myblog.com/recipes and cheap-pills.xyz'), 'More on and');
  assertEquals(stripLinks('See (https://example.com) for more'), 'See for more');
  for (const text of [
    'Add 1.5 cups of flour and 2.5 tsp salt.',
    'Bake at 180°C for 20-25 min.',
    'Season with salt.Pepper to taste',
    'Use a 9x13 in. pan',
    'Mix e.g. with a fork, i.e. gently.',
  ]) {
    assertEquals(stripLinks(text), text);
  }
});

Deno.test('every text field of a card loses its links', () => {
  const clean = stripRecipeLinks({
    title: 'Pancakes - mysite.com',
    ingredients: [{ name: 'flour (buy at https://shop.example/flour)', quantity: 200, unit: 'g', metric: { quantity: 200, unit: 'g' } }],
    instructions: [{ step: 1, text: 'Whisk. Video: https://youtu.be/abc' }],
    tags: ['breakfast', 'www.spam.example'],
    image_url: 'https://cdn.example.com/p.jpg',
  });
  assertEquals(clean.title, 'Pancakes -');
  assertEquals(clean.ingredients, [{ name: 'flour (buy at)', quantity: 200, unit: 'g', metric: { quantity: 200, unit: 'g' } }]);
  assertEquals(clean.instructions, [{ step: 1, text: 'Whisk. Video:' }]);
  assertEquals(clean.tags, ['breakfast']);
  assertEquals(clean.image_url, 'https://cdn.example.com/p.jpg', 'media columns are not text');
});

// The model's answer ---------------------------------------------------------------------------

Deno.test('the moderation answer is read strictly', () => {
  assertEquals(readModerationAnswer({ publish: true, reason: 'ok' }), { verdict: 'ok' });
  assertEquals(readModerationAnswer({ publish: false, reason: 'spam' }), { verdict: 'reject', reason: 'spam' });
  assertEquals(readModerationAnswer({ publish: true, reason: 'dangerous' }), { verdict: 'reject', reason: 'dangerous' });
  assertEquals(readModerationAnswer({ publish: false, reason: 'ok' }), { verdict: 'reject', reason: 'not_a_recipe' });
  assertEquals(readModerationAnswer({ publish: 'yes' }), null);
  assertEquals(readModerationAnswer('publish'), null);
  assertEquals(readModerationAnswer(null), null);
});

Deno.test('the whole card is shown to the reviewer, past where other checks cut off', () => {
  const text = buildModerationUserText({
    title: 'Soup',
    ingredients: Array.from({ length: 60 }, (_, i) => ({ name: `ingredient ${i + 1}`, notes: i === 59 ? 'call 555-0100' : undefined })),
    instructions: Array.from({ length: 40 }, (_, i) => ({ step: i + 1, text: i === 39 ? 'Then visit the shop' : 'Stir' })),
    tags: ['soup'],
  });
  assert(text.includes('ingredient 60 call 555-0100'));
  assert(text.includes('40. Then visit the shop'));
  assert(text.includes('Tags: soup'));
});

// Publishing -----------------------------------------------------------------------------------

type Row = Record<string, unknown>;

/** Just enough of the Supabase client for recipeCards.ts: one table of cards, plus usage rows. */
function fakeAdmin(cards: Row[], usage: Row[] = []): Db {
  const from = (table: string) => {
    let filter: ((row: Row) => boolean) | null = null;
    let pending: (() => Row | Row[] | null) | null = null;
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => ((filter = (row) => row[column] === value), query),
      is: () => query,
      insert: (row: Row) => {
        pending = () => {
          const stored = { id: `card-${cards.length + 1}`, ...row };
          (table === 'recipe_cards' ? cards : usage).push(stored);
          return stored;
        };
        return query;
      },
      update: (changes: Row) => {
        pending = () => {
          const hit = cards.filter((row) => filter?.(row));
          for (const row of hit) Object.assign(row, changes);
          return hit;
        };
        return query;
      },
      maybeSingle: () => query.single(),
      single: () => {
        const data = pending ? pending() : (cards.find((row) => filter?.(row)) ?? null);
        return Promise.resolve({ data: Array.isArray(data) ? data[0] ?? null : data, error: null });
      },
      then: (resolve: (value: unknown) => void) => resolve({ data: pending ? pending() : null, error: null }),
    };
    return query;
  };
  return { from } as unknown as Db;
}

const SOUP: HubRecipeSnapshot = {
  title: 'Leek soup',
  original_url: 'https://example.com/leek-soup?utm_source=x',
  platform: 'web',
  image_url: 'https://cdn.example.com/soup.jpg',
  ingredients: [{ name: 'leek', quantity: 2, unit: '' }, { name: 'potato', quantity: 3, unit: '' }],
  instructions: [{ step: 1, text: 'Chop the leeks.' }, { step: 2, text: 'Simmer, see https://example.com/video' }],
  servings: 2,
  extraction_status: 'full',
  extraction_source: 'web',
  tags: ['soup'],
};

const ok = (): Promise<ModerationResult> => Promise.resolve({ verdict: 'ok', usages: [] });
const never = (): Promise<ModerationResult> => {
  throw new Error('moderation should not run');
};

const DRAWN = 'https://project.supabase.co/storage/v1/object/public/recipe-thumbnails/ai/abc.jpg';
const OUR_COPY = 'https://project.supabase.co/storage/v1/object/public/recipe-thumbnails/web/def.jpg';
const drawn = (): Promise<DrawRecipeImageResult> =>
  Promise.resolve({
    ok: true,
    url: DRAWN,
    model: 'qwen/qwen-image-2.1-turbo',
    bytes: 150_000,
    ms: 10,
    usage: {
      model: 'qwen/qwen-image-2.1-turbo',
      kind: 'recipe_image',
      promptTokenCount: 0,
      candidatesTokenCount: 0,
      thoughtsTokenCount: 0,
      totalTokenCount: 0,
      costUsd: 0.0184,
    },
  });
const cannotDraw = (): Promise<DrawRecipeImageResult> =>
  Promise.resolve({ ok: false, error: 'every model failed', usage: null, ms: 5 });
const mustNotDraw = (): Promise<DrawRecipeImageResult> => {
  throw new Error('no picture should be drawn');
};

/** Runs `fn` with SUPABASE_URL set, so hubImageUrl accepts OUR_COPY. */
async function withProjectUrl(fn: () => Promise<void>): Promise<void> {
  const previous = Deno.env.get('SUPABASE_URL');
  Deno.env.set('SUPABASE_URL', 'https://project.supabase.co');
  try {
    await fn();
  } finally {
    if (previous === undefined) Deno.env.delete('SUPABASE_URL');
    else Deno.env.set('SUPABASE_URL', previous);
  }
}

Deno.test('a recipe that passes the check is published without its links', async () => {
  const cards: Row[] = [];
  const usage: Row[] = [];
  const published = await publishRecipeCard(fakeAdmin(cards, usage), SOUP, null, {
    moderate: ok,
    drawImage: drawn,
    userId: 'user-1',
  });
  assertEquals(published, { id: 'card-1', needsDiets: true });
  assertEquals(cards.length, 1);
  assertEquals(cards[0].canonical_key, 'web:https://example.com/leek-soup');
  assertEquals(cards[0].hidden_at, undefined);
  assertEquals(cards[0].instructions, [{ step: 1, text: 'Chop the leeks.' }, { step: 2, text: 'Simmer, see' }]);
  // The source site's image link is never published; a drawn picture takes its place.
  assertEquals(cards[0].image_url, DRAWN);
  assertEquals(cards[0].image_generated, true);
  assertEquals(usage.map((row) => [row.action, row.status, row.user_id]), [
    ['hub_moderation', 'ok', 'user-1'],
    ['recipe_image', 'ok', 'user-1'],
  ]);
});

Deno.test('when no picture can be drawn, the card goes up without one', async () => {
  const cards: Row[] = [];
  const usage: Row[] = [];
  await publishRecipeCard(fakeAdmin(cards, usage), SOUP, null, { moderate: ok, drawImage: cannotDraw });
  assertEquals(cards[0].image_url, null);
  assertEquals(cards[0].image_generated, false);
  assertEquals(usage.map((row) => [row.action, row.status, row.error_message]), [
    ['hub_moderation', 'ok', null],
    ['recipe_image', 'failed', 'every model failed'],
  ]);
});

Deno.test('a card with our copy of the photo is never drawn, and a rejected one never either', async () => {
  await withProjectUrl(async () => {
    const cards: Row[] = [];
    await publishRecipeCard(fakeAdmin(cards), { ...SOUP, image_url: OUR_COPY }, null, { moderate: ok, drawImage: mustNotDraw });
    assertEquals([cards[0].image_url, cards[0].image_generated], [OUR_COPY, false]);
  });
  const rejected: Row[] = [];
  const reject = (): Promise<ModerationResult> => Promise.resolve({ verdict: 'reject', reason: 'spam', usages: [] });
  await publishRecipeCard(fakeAdmin(rejected), SOUP, null, { moderate: reject, drawImage: mustNotDraw });
  assert(rejected[0].hidden_at);
});

Deno.test('a card left without a picture gets one on the next import, and a real photo replaces a drawn one', async () => {
  await withProjectUrl(async () => {
    const cards: Row[] = [];
    const admin = fakeAdmin(cards);
    await publishRecipeCard(admin, SOUP, null, { moderate: ok, drawImage: cannotDraw });
    assertEquals(cards[0].image_url, null);

    await publishRecipeCard(admin, SOUP, null, { moderate: never, drawImage: drawn });
    assertEquals([cards[0].image_url, cards[0].image_generated], [DRAWN, true]);

    // Drawn already: another import without a photo leaves it alone.
    await publishRecipeCard(admin, SOUP, null, { moderate: never, drawImage: mustNotDraw });
    assertEquals(cards[0].image_url, DRAWN);

    await publishRecipeCard(admin, { ...SOUP, image_url: OUR_COPY }, null, { moderate: never, drawImage: mustNotDraw });
    assertEquals([cards[0].image_url, cards[0].image_generated], [OUR_COPY, false]);
  });
});

Deno.test('a rejected recipe is stored hidden, and never served or published again', async () => {
  const cards: Row[] = [];
  const admin = fakeAdmin(cards);
  const reject = (): Promise<ModerationResult> => Promise.resolve({ verdict: 'reject', reason: 'spam', usages: [] });
  assertEquals(await publishRecipeCard(admin, SOUP, null, { moderate: reject }), null);
  assertEquals(cards.length, 1);
  assert(cards[0].hidden_at);
  assertEquals(cards[0].hidden_reason, 'moderation:spam');

  // The same link again: the hidden card is not a cache hit, and is not replaced.
  assertEquals(await findRecipeCard(admin, 'web', SOUP.original_url!), null);
  assertEquals(await publishRecipeCard(admin, SOUP, null, { moderate: never }), null);
  assertEquals(cards.length, 1);
});

Deno.test('when the check cannot run, nothing is published', async () => {
  const cards: Row[] = [];
  const usage: Row[] = [];
  const broken = (): Promise<ModerationResult> => Promise.resolve({ verdict: 'error', error: 'timeout', usages: [] });
  assertEquals(await publishRecipeCard(fakeAdmin(cards, usage), SOUP, null, { moderate: broken }), null);
  assertEquals(cards.length, 0);
  assertEquals(usage.map((row) => [row.action, row.status, row.error_message]), [['hub_moderation', 'failed', 'timeout']]);
});

Deno.test('a link that is not a plain public page is never published or checked', async () => {
  const cards: Row[] = [];
  for (const original_url of ['https://docs.google.com/document/d/abc/edit', 'https://example.com/recipe?token=s3cr3t']) {
    assertEquals(await publishRecipeCard(fakeAdmin(cards), { ...SOUP, original_url }, null, { moderate: never }), null);
  }
  assertEquals(cards.length, 0);
});

Deno.test('a recipe that is only links is not a recipe', async () => {
  const cards: Row[] = [];
  const spam = { ...SOUP, title: 'www.cheap-pills.example' };
  assertEquals(await publishRecipeCard(fakeAdmin(cards), spam, null, { moderate: never }), null);
  assertEquals(cards.length, 0);
});

Deno.test('an existing public card is found again without a second check', async () => {
  const cards: Row[] = [];
  const admin = fakeAdmin(cards);
  await publishRecipeCard(admin, SOUP, null, { moderate: ok, drawImage: drawn });
  cards[0].diets = ['vegetarian'];
  const again = await publishRecipeCard(admin, { ...SOUP, title: 'Changed' }, null, { moderate: never });
  assertEquals(again, { id: 'card-1', needsDiets: false });
  assertEquals(cards[0].title, 'Leek soup', "an existing card's text is never rewritten");
  assert((await findRecipeCard(admin, 'web', 'https://www.example.com/leek-soup/'))?.id === 'card-1');
});

Deno.test('a web card only shows our own copy of the image', () => {
  const previous = Deno.env.get('SUPABASE_URL');
  Deno.env.set('SUPABASE_URL', 'https://project.supabase.co');
  try {
    const ours = 'https://project.supabase.co/storage/v1/object/public/recipe-thumbnails/web/abc.jpg';
    assertEquals(hubImageUrl('web', ours), ours);
    assertEquals(hubImageUrl('web', 'https://cdn.example.com/soup.jpg'), null);
    assertEquals(hubImageUrl('web', 'https://evil.example/storage/v1/object/public/recipe-thumbnails/web/abc.jpg'), null);
    assertEquals(hubImageUrl('web', null), null);
    // Video platforms keep theirs: YouTube's own thumbnail, or a copy made at extraction.
    assertEquals(hubImageUrl('youtube', 'https://i.ytimg.com/vi/x/hq720.jpg'), 'https://i.ytimg.com/vi/x/hq720.jpg');
  } finally {
    if (previous === undefined) Deno.env.delete('SUPABASE_URL');
    else Deno.env.set('SUPABASE_URL', previous);
  }
});
