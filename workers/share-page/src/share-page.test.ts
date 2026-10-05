import { afterEach, describe, expect, it, vi } from 'vitest';

import { handleShareRequest } from './index';
import { formatIngredient, recipeJsonLd, renderSharePage, shareDescription, type SharedRecipe } from './render';

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
    expect(formatIngredient({ name: 'chili oil', quantity: 0.333, unit: 'tbsp' })).toBe('0.33 tbsp chili oil');
    expect(formatIngredient({ name: 'salt', quantity: 0, unit: '' })).toBe('salt');
    expect(formatIngredient({ name: ' ', quantity: 1 })).toBeNull();
  });

  it('describes the recipe', () => {
    expect(shareDescription(recipe)).toBe(
      'A recipe saved from TikTok with Pinch · 15 min · serves 2 · 3 ingredients.',
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
      recipeIngredient: ['200 g noodles', '0.33 tbsp chili oil', 'salt'],
      recipeInstructions: [
        { '@type': 'HowToStep', text: 'Boil the noodles.' },
        { '@type': 'HowToStep', text: 'Toss with chili oil.' },
      ],
      isBasedOn: 'https://www.tiktok.com/@cook/video/123',
    });
  });

  it('escapes recipe text in HTML and JSON-LD', () => {
    const html = renderSharePage(recipe, TOKEN);
    expect(html).toContain('<h1>Crispy &lt;Chili&gt; Oil Noodles</h1>');
    expect(html).toContain('<meta property="og:title" content="Crispy &lt;Chili&gt; Oil Noodles · Pinch" />');
    expect(html).toContain('"name":"Crispy \\u003cChili> Oil Noodles"');
    expect(html).not.toContain('<Chili>');
    expect(html).toContain(`<link rel="canonical" href="https://pinch-app.io/s/${TOKEN}" />`);
    expect(html).toContain('summary_large_image');
  });

  it('falls back to the app icon when the image is not https', () => {
    const html = renderSharePage({ ...recipe, image_url: 'http://insecure.example.com/x.jpg' }, TOKEN);
    expect(html).toContain('<meta property="og:image" content="https://pinch-app.io/icon.png" />');
    expect(html).not.toContain('class="hero"');
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
