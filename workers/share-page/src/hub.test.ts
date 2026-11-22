import { afterEach, describe, expect, it, vi } from 'vitest';

import { INDEXNOW_KEY as SITE_INDEXNOW_KEY } from '../../../scripts/indexnow.mjs';
import { idRangeForSlug, INDEXNOW_KEY, isIndexable, recipeSitemap, submitChangedRecipes } from './hub';
import worker, { handleHubRequest, handleSitemapRequest } from './index';
import { type HubRecipe, renderHubPage } from './render';

const env = { SUPABASE_URL: 'https://example.supabase.co/', SUPABASE_KEY: 'sb_publishable_test' };
const CARD_ID = '16dcf08b-fa53-4a1b-9c2d-0e1f2a3b4c5d';
const SLUG = 'honey-butter-cornbread-16dcf08bfa53';

const card: HubRecipe = {
  id: CARD_ID,
  public_slug: SLUG,
  title: 'Honey <Butter> Cornbread',
  platform: 'tiktok',
  original_url: 'https://www.tiktok.com/@cook/video/123',
  image_url: 'https://cdn.example.com/cornbread.jpg',
  servings: 2,
  estimated_time_minutes: 15,
  ingredients: [
    { name: 'cornmeal', quantity: 200, unit: 'g' },
    { name: 'honey', quantity: 0.333, unit: 'cup' },
    { name: 'salt', quantity: 0, unit: '' },
  ],
  instructions: [
    { step: 2, text: 'Bake.' },
    { step: 1, text: 'Mix.' },
  ],
  extraction_status: 'full',
  source_language: 'en',
  created_at: '2026-11-02T10:00:00Z',
  updated_at: '2026-11-10T08:30:00Z',
};

function mockSupabase(status: number, body: unknown) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('hub rules', () => {
  it('turns a slug into the id range its 12 hex digits stand for', () => {
    expect(idRangeForSlug(SLUG)).toEqual({
      from: '16dcf08b-fa53-0000-0000-000000000000',
      to: '16dcf08b-fa53-ffff-ffff-ffffffffffff',
    });
    expect(idRangeForSlug('c160897a0a21')).not.toBeNull();
    expect(idRangeForSlug('cornbread')).toBeNull();
    expect(idRangeForSlug('x-16dcf08bfa5')).toBeNull();
    expect(idRangeForSlug('<script>-16dcf08bfa53')).toBeNull();
  });

  it('keeps thin recipes out of search', () => {
    expect(isIndexable(card)).toBe(true);
    expect(isIndexable({ ...card, extraction_status: 'partial' })).toBe(false);
    expect(isIndexable({ ...card, instructions: [] })).toBe(false);
    expect(isIndexable({ ...card, ingredients: [{ name: 'flour' }, { name: 'milk' }] })).toBe(false);
    expect(isIndexable({ ...card, ingredients: [{ name: 'a' }, { name: 'b' }, { name: ' ' }] })).toBe(false);
  });

  it('lists recipe pages in the sitemap', () => {
    const xml = recipeSitemap([card]);
    expect(xml).toContain(`<loc>https://pinch-app.io/r/${SLUG}</loc>`);
    expect(xml).toContain('<lastmod>2026-11-10</lastmod>');
  });

  it('uses the same IndexNow key as the site build', () => {
    expect(INDEXNOW_KEY).toBe(SITE_INDEXNOW_KEY);
  });
});

describe('renderHubPage', () => {
  it('renders an indexable page that credits the creator and opens the Hub card', () => {
    const html = renderHubPage(card, 'en', true);
    expect(html).toContain('<meta name="robots" content="index, follow, max-image-preview:large" />');
    expect(html).toContain(`<link rel="canonical" href="https://pinch-app.io/r/${SLUG}" />`);
    expect(html).toContain('<p class="eyebrow">Recipe from TikTok</p>');
    expect(html).toContain('All credit goes to the original creator.');
    expect(html).toContain('href="https://www.tiktok.com/@cook/video/123"');
    expect(html).toContain(`href="pinch://hub/${CARD_ID}"`);
    expect(html).toContain(`href="/app/hub/${CARD_ID}"`);
    expect(html).toContain(`intent://hub/${CARD_ID}#Intent`);
    expect(html).toContain('"datePublished":"2026-11-02"');
    expect(html).toContain('"description":"Recipe from TikTok · 15 min · Serves 2 · 3 ingredients."');
    expect(html).toContain('<h1 dir="auto">Honey &lt;Butter&gt; Cornbread</h1>');
    expect(html).not.toContain('<Butter>');
    expect(html).not.toContain('Shared with you');
  });

  it('credits a website source by its host name', () => {
    const html = renderHubPage({ ...card, platform: 'web', original_url: 'https://www.example.com/cornbread' }, 'en', true);
    expect(html).toContain('<p class="eyebrow">Recipe from example.com</p>');
  });

  it('marks thin recipe pages noindex', () => {
    expect(renderHubPage(card, 'en', false)).toContain('<meta name="robots" content="noindex" />');
  });
});

describe('handleHubRequest', () => {
  it('ignores other paths', async () => {
    expect(await handleHubRequest(new Request('https://pinch-app.io/recipes'), env)).toBeNull();
  });

  it('renders a 200 indexable page in the recipe language, whatever the browser says', async () => {
    const fetchMock = mockSupabase(200, [{ ...card, source_language: 'he' }]);
    const response = await handleHubRequest(
      new Request(`https://pinch-app.io/r/${SLUG}`, { headers: { 'Accept-Language': 'es' } }),
      env,
    );
    expect(response?.status).toBe(200);
    expect(response?.headers.get('X-Robots-Tag')).toBeNull();
    expect(response?.headers.get('Vary')).toBeNull();
    const html = await response?.text();
    expect(html).toContain('<html lang="he" dir="rtl">');
    expect(html).toContain('application/ld+json');
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('https://example.supabase.co/rest/v1/recipe_cards?');
    expect(url).toContain('id=gte.16dcf08b-fa53-0000-0000-000000000000&id=lte.16dcf08b-fa53-ffff-ffff-ffffffffffff');
  });

  it('sends noindex for thin recipes', async () => {
    mockSupabase(200, [{ ...card, instructions: [] }]);
    const response = await handleHubRequest(new Request(`https://pinch-app.io/r/${SLUG}`), env);
    expect(response?.status).toBe(200);
    expect(response?.headers.get('X-Robots-Tag')).toBe('noindex');
  });

  it('redirects an old title, upper case or a trailing slash to the canonical URL', async () => {
    for (const path of ['/r/old-title-16dcf08bfa53', '/r/16dcf08bfa53', `/r/${SLUG.toUpperCase()}`, `/r/${SLUG}/`]) {
      mockSupabase(200, [card]);
      const response = await handleHubRequest(new Request(`https://pinch-app.io${path}`), env);
      expect(response?.status).toBe(301);
      expect(response?.headers.get('Location')).toBe(`https://pinch-app.io/r/${SLUG}`);
    }
  });

  it('prefers the exact slug when two cards share the id digits', async () => {
    mockSupabase(200, [{ ...card, public_slug: 'other-16dcf08bfa53' }, card]);
    const response = await handleHubRequest(new Request(`https://pinch-app.io/r/${SLUG}`), env);
    expect(response?.status).toBe(200);
  });

  it('returns a noindex 404 for unknown recipes and bad slugs', async () => {
    mockSupabase(200, []);
    const missing = await handleHubRequest(new Request(`https://pinch-app.io/r/${SLUG}`), env);
    expect(missing?.status).toBe(404);
    expect(missing?.headers.get('X-Robots-Tag')).toBe('noindex');

    const fetchMock = mockSupabase(200, [card]);
    const bad = await handleHubRequest(new Request('https://pinch-app.io/r/cornbread'), env);
    expect(bad?.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('puts one serving of calories and macros in the Recipe schema (PIN-80)', async () => {
    const fetchMock = mockSupabase(200, [{ ...card, calories: 900, nutrition: { protein_g: 60, carbs_g: 80, fat_g: 36 } }]);
    const response = await handleHubRequest(new Request(`https://pinch-app.io/r/${SLUG}`), env);
    const html = (await response?.text()) ?? '';
    expect(fetchMock.mock.calls[0][0]).toContain(',calories,');
    expect(fetchMock.mock.calls[0][0]).toContain(',nutrition&');
    expect(html).toContain(
      '"nutrition":{"@type":"NutritionInformation","servingSize":"1 serving","calories":"450 calories","proteinContent":"30 g","carbohydrateContent":"40 g","fatContent":"18 g"}',
    );
  });

  it('still renders the page when the nutrition column is not there yet', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes('nutrition')
        ? new Response(JSON.stringify({ code: '42703', message: 'column recipe_cards.nutrition does not exist' }), { status: 400 })
        : new Response(JSON.stringify([card]), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const response = await handleHubRequest(new Request(`https://pinch-app.io/r/${SLUG}`), env);
    expect(response?.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns a retryable 503 when Supabase fails', async () => {
    mockSupabase(500, { message: 'boom' });
    const response = await handleHubRequest(new Request(`https://pinch-app.io/r/${SLUG}`), env);
    expect(response?.status).toBe(503);
    expect(response?.headers.get('Retry-After')).toBe('60');
  });
});

describe('handleSitemapRequest', () => {
  it('serves indexable Hub recipes as a sitemap', async () => {
    const fetchMock = mockSupabase(200, [card, { ...card, public_slug: 'thin-aaaaaaaaaaaa', instructions: [] }]);
    const response = await handleSitemapRequest(new Request('https://pinch-app.io/sitemap-recipes.xml'), env);
    expect(response?.status).toBe(200);
    expect(response?.headers.get('Content-Type')).toBe('application/xml; charset=utf-8');
    const xml = await response?.text();
    expect(xml).toContain(SLUG);
    expect(xml).not.toContain('thin-aaaaaaaaaaaa');
    expect(fetchMock.mock.calls[0][0]).toContain('extraction_status=eq.full');
  });

  it('ignores other paths and fails soft', async () => {
    expect(await handleSitemapRequest(new Request('https://pinch-app.io/sitemap.xml'), env)).toBeNull();
    mockSupabase(500, {});
    const response = await handleSitemapRequest(new Request('https://pinch-app.io/sitemap-recipes.xml'), env);
    expect(response?.status).toBe(503);
  });
});

describe('IndexNow', () => {
  it('sends recipes changed since the last run', async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
      url.includes('indexnow') ? new Response('', { status: 202 }) : new Response(JSON.stringify([card])),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(submitChangedRecipes(env, new Date('2026-11-18T06:17:00Z'))).resolves.toBe(
      'IndexNow: sent 1 recipe URL(s)',
    );
    expect(fetchMock.mock.calls[0][0]).toContain('updated_at=gte.2026-11-18T06:17:00.000Z');
    const [endpoint, init] = fetchMock.mock.calls[1];
    expect(endpoint).toBe('https://api.indexnow.org/indexnow');
    expect(JSON.parse(init?.body as string)).toMatchObject({
      host: 'pinch-app.io',
      key: INDEXNOW_KEY,
      keyLocation: `https://pinch-app.io/${INDEXNOW_KEY}.txt`,
      urlList: [`https://pinch-app.io/r/${SLUG}`],
    });
  });

  it('skips the request when nothing changed', async () => {
    const fetchMock = mockSupabase(200, []);
    await expect(submitChangedRecipes(env, new Date())).resolves.toBe('IndexNow: no changed recipes');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('runs from the cron trigger with a 26 hour window', async () => {
    const fetchMock = mockSupabase(200, []);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await worker.scheduled({ scheduledTime: Date.parse('2026-11-19T06:17:00Z') }, env);
    expect(fetchMock.mock.calls[0][0]).toContain('updated_at=gte.2026-11-18T04:17:00.000Z');
  });
});
