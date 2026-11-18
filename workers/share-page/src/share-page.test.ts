import { afterEach, describe, expect, it, vi } from 'vitest';

import { handleAppLinkRequest } from './appLinks';
import { handleShareRequest } from './index';
import {
  APP_STORE_URL,
  formatIngredient,
  formatQuantity,
  PLAY_STORE_URL,
  recipeJsonLd,
  renderSharePage,
  shareDescription,
  type SharedRecipe,
} from './render';
import { pickLanguage } from './strings';

const env = { SUPABASE_URL: 'https://example.supabase.co/', SUPABASE_KEY: 'sb_publishable_test' };
const TOKEN = 'AbCdEfGhIjKlMnOpQrStUv_-';

const recipe: SharedRecipe = {
  title: 'Crispy <Chili> Oil Noodles',
  platform: 'tiktok',
  original_url: 'https://www.tiktok.com/@cook/video/123',
  image_url: 'https://cdn.example.com/noodles.jpg',
  servings: 2,
  estimated_time_minutes: 15,
  tags: ['noodles', 'spicy'],
  ingredients: [
    { name: 'noodles', quantity: 200, unit: 'g' },
    { name: 'chili oil', quantity: 0.333, unit: 'tbsp' },
    { name: 'salt', quantity: 0, unit: '' },
  ],
  instructions: [
    { step: 2, text: 'Toss with chili oil.' },
    { step: 1, text: 'Boil the noodles.' },
  ],
};

function mockSupabase(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('render', () => {
  it('formats ingredients and skips empty ones', () => {
    expect(formatIngredient({ name: 'chili oil', quantity: 0.333, unit: 'tbsp' })).toBe('⅓ tbsp chili oil');
    expect(formatIngredient({ name: 'salt', quantity: 0, unit: '' })).toBe('salt');
    expect(formatIngredient({ name: 'Kinder Bueno pieces', unit: 'to taste' })).toBe('Kinder Bueno pieces (to taste)');
    expect(formatIngredient({ name: ' ', quantity: 1 })).toBeNull();
  });

  it('writes common fractions', () => {
    expect(formatQuantity(1.5)).toBe('1½');
    expect(formatQuantity(0.25)).toBe('¼');
    expect(formatQuantity(2)).toBe('2');
    expect(formatQuantity(2.4)).toBe('2.4');
  });

  it('describes the recipe', () => {
    expect(shareDescription(recipe)).toBe(
      'A recipe saved from TikTok with Pinch · 15 min · Serves 2 · 3 ingredients.',
    );
  });

  it('builds Recipe schema with ordered steps', () => {
    const data = recipeJsonLd(recipe, `https://pinch-app.io/s/${TOKEN}`);
    expect(data).toMatchObject({
      '@type': 'Recipe',
      name: recipe.title,
      image: ['https://cdn.example.com/noodles.jpg'],
      totalTime: 'PT15M',
      recipeYield: '2 servings',
      recipeIngredient: ['200 g noodles', '⅓ tbsp chili oil', 'salt'],
      recipeInstructions: [
        { '@type': 'HowToStep', text: 'Boil the noodles.' },
        { '@type': 'HowToStep', text: 'Toss with chili oil.' },
      ],
      isBasedOn: 'https://www.tiktok.com/@cook/video/123',
    });
  });

  it('escapes recipe text in HTML and JSON-LD', () => {
    const html = renderSharePage(recipe, TOKEN);
    expect(html).toContain('<h1 dir="auto">Crispy &lt;Chili&gt; Oil Noodles</h1>');
    expect(html).toContain('<meta property="og:title" content="Crispy &lt;Chili&gt; Oil Noodles · Pinch" />');
    expect(html).toContain('"name":"Crispy \\u003cChili> Oil Noodles"');
    expect(html).not.toContain('<Chili>');
    expect(html).toContain(`<link rel="canonical" href="https://pinch-app.io/s/${TOKEN}" />`);
    expect(html).toContain('summary_large_image');
  });

  it('falls back to the app icon when the image is not https', () => {
    const html = renderSharePage({ ...recipe, image_url: 'http://insecure.example.com/x.jpg' }, TOKEN);
    expect(html).toContain('<meta property="og:image" content="https://pinch-app.io/og-image.jpg" />');
    expect(html).not.toContain('<img');
  });

  it('links to both app stores, the app and the web app', () => {
    const html = renderSharePage(recipe, TOKEN);
    expect(html).toContain(`href="${APP_STORE_URL}"`);
    expect(html).toContain(`href="${PLAY_STORE_URL}"`);
    expect(html).toContain(`href="pinch://s/${TOKEN}"`);
    expect(html).toContain(`href="/app/s/${TOKEN}"`);
    expect(html).toContain(`app-argument=https://pinch-app.io/s/${TOKEN}`);
    expect(html).toContain('S.browser_fallback_url=');
  });

  it('keeps share pages out of search results', () => {
    expect(renderSharePage(recipe, TOKEN)).toContain('<meta name="robots" content="noindex" />');
  });

  it('never jumps to the app on its own', () => {
    expect(renderSharePage(recipe, TOKEN)).not.toMatch(/setTimeout\(function \(\) \{ window\.location\.href = 'pinch:/);
  });

  it('writes the page in the chosen language and direction', () => {
    const html = renderSharePage(recipe, TOKEN, 'he');
    expect(html).toContain('<html lang="he" dir="rtl">');
    expect(html).toContain('מרכיבים');
    expect(html).toContain('Crispy &lt;Chili&gt; Oil Noodles');
  });
});

describe('pickLanguage', () => {
  it('follows the browser language when we have it', () => {
    expect(pickLanguage('he-IL,he;q=0.9,en;q=0.8')).toBe('he');
    expect(pickLanguage('fr-FR,es;q=0.5', 'en')).toBe('es');
    expect(pickLanguage('iw')).toBe('he');
  });

  it('falls back to English for browsers in other languages', () => {
    expect(pickLanguage('fr-FR,fr;q=0.9', 'he')).toBe('en');
  });

  it('uses the recipe language when the client sends none (link-preview crawlers)', () => {
    expect(pickLanguage(null, 'ru')).toBe('ru');
    expect(pickLanguage('', 'de')).toBe('en');
  });
});

describe('handleAppLinkRequest', () => {
  it('serves the Apple app site association as JSON', async () => {
    for (const path of ['/.well-known/apple-app-site-association', '/apple-app-site-association']) {
      const response = handleAppLinkRequest(new Request(`https://pinch-app.io${path}`));
      expect(response?.status).toBe(200);
      expect(response?.headers.get('Content-Type')).toBe('application/json');
      expect(await response?.json()).toEqual({
        applinks: {
          details: [
            { appIDs: ['V9W92RK5W6.com.pinch.myapp'], components: [{ '/': '/s/*', comment: 'Shared recipes' }] },
          ],
        },
      });
    }
  });

  it('serves Android asset links for the Play signing key', async () => {
    const response = handleAppLinkRequest(new Request('https://pinch-app.io/.well-known/assetlinks.json'));
    expect(response?.headers.get('Content-Type')).toBe('application/json');
    const [link] = (await response?.json()) as { target: { package_name: string; sha256_cert_fingerprints: string[] } }[];
    expect(link.target.package_name).toBe('com.pinch.myapp');
    expect(link.target.sha256_cert_fingerprints[0]).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
  });

  it('leaves other paths to GitHub Pages', () => {
    expect(handleAppLinkRequest(new Request('https://pinch-app.io/.well-known/security.txt'))).toBeNull();
    expect(handleAppLinkRequest(new Request('https://pinch-app.io/'))).toBeNull();
  });
});

describe('handleShareRequest', () => {
  it('ignores paths outside /s/', async () => {
    expect(await handleShareRequest(new Request('https://pinch-app.io/app/s/x'), env)).toBeNull();
  });

  it('renders a 200 page for a live share', async () => {
    const fetchMock = mockSupabase(200, { status: 'ok', token: TOKEN, recipe });
    const response = await handleShareRequest(new Request(`https://pinch-app.io/s/${TOKEN}`), env);
    expect(response?.status).toBe(200);
    expect(response?.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(response?.headers.get('X-Robots-Tag')).toBe('noindex');
    expect(response?.headers.get('Vary')).toBe('Accept-Language');
    expect(await response?.text()).toContain('application/ld+json');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.supabase.co/functions/v1/recipe-share',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ action: 'get', token: TOKEN }) }),
    );
  });

  it('returns a noindex 404 for missing or revoked shares', async () => {
    mockSupabase(404, { error: 'Share not found', code: 'share_not_found' });
    const response = await handleShareRequest(new Request(`https://pinch-app.io/s/${TOKEN}`), env);
    expect(response?.status).toBe(404);
    expect(await response?.text()).toContain('<meta name="robots" content="noindex" />');
  });

  it('rejects malformed tokens without calling Supabase', async () => {
    const fetchMock = mockSupabase(200, {});
    const response = await handleShareRequest(new Request('https://pinch-app.io/s/%3Cscript%3E'), env);
    expect(response?.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns a retryable 503 when Supabase fails', async () => {
    mockSupabase(500, { error: 'boom' });
    const response = await handleShareRequest(new Request(`https://pinch-app.io/s/${TOKEN}`), env);
    expect(response?.status).toBe(503);
    expect(response?.headers.get('Retry-After')).toBe('60');
    expect(await response?.text()).toContain(`/app/s/${TOKEN}`);
  });
});
