import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_THEME_PACK, ThemePacks } from '../../../shared/constants/themes';

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

  it('adds per-serving nutrition only when there are calories (PIN-80)', () => {
    expect(recipeJsonLd(recipe, 'https://pinch-app.io/s/x').nutrition).toBeUndefined();
    expect(recipeJsonLd({ ...recipe, calories: 900 }, 'https://pinch-app.io/s/x').nutrition).toEqual({
      '@type': 'NutritionInformation',
      servingSize: '1 serving',
      calories: '450 calories',
    });
    expect(
      recipeJsonLd({ ...recipe, calories: 900, nutrition: { protein_g: 60, carbs_g: 80, fat_g: 36 } }, 'https://pinch-app.io/s/x')
        .nutrition,
    ).toMatchObject({ proteinContent: '30 g', carbohydrateContent: '40 g', fatContent: '18 g' });
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

  describe('"Open in Pinch" on an iPhone', () => {
    /** Runs the page's open-app script in a fake iPhone browser and taps the button. */
    function tapOpenInPinch() {
      const script = /<script>\n(\(function \(\) \{[\s\S]*?\}\)\(\);)\n<\/script>/.exec(renderSharePage(recipe, TOKEN))?.[1];
      if (!script) throw new Error('no open-app script on the page');
      const listeners: Record<string, (() => void)[]> = {};
      const listen = (prefix: string) => (type: string, listener: () => void) => {
        (listeners[prefix + type] ??= []).push(listener);
      };
      let onTap: ((event: { preventDefault: () => void }) => void) | undefined;
      const button = { setAttribute: () => {}, addEventListener: (_type: string, listener: typeof onTap) => (onTap = listener) };
      const fakeDocument = {
        hidden: false,
        hasFocus: () => true,
        querySelectorAll: (selector: string) => (selector === '[data-open-app]' ? [button] : []),
        addEventListener: listen('document:'),
      };
      const fakeWindow = { location: { href: '' }, addEventListener: listen('window:') };
      const fakeNavigator = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', platform: 'iPhone', maxTouchPoints: 5 };
      new Function('window', 'document', 'navigator', script)(fakeWindow, fakeDocument, fakeNavigator);
      onTap?.({ preventDefault: () => {} });
      const fire = (name: string) => listeners[name]?.forEach((listener) => listener());
      return { location: fakeWindow.location, document: fakeDocument, fire };
    }

    afterEach(() => {
      vi.useRealTimers();
    });

    it('opens the app, then the App Store only when nothing happened (no app)', () => {
      vi.useFakeTimers();
      const page = tapOpenInPinch();
      expect(page.location.href).toBe(`pinch://s/${TOKEN}`);
      vi.advanceTimersByTime(2000);
      expect(page.location.href).toBe(APP_STORE_URL);
    });

    it.each([
      ['the page loses focus (iOS asks "Open in Pinch?")', 'window:blur'],
      ['the page is put away', 'window:pagehide'],
    ])('stays out of the App Store when %s', (_case, event) => {
      vi.useFakeTimers();
      const page = tapOpenInPinch();
      page.fire(event);
      vi.advanceTimersByTime(5000);
      expect(page.location.href).toBe(`pinch://s/${TOKEN}`);
    });

    it('stays out of the App Store when the app comes to the front', () => {
      vi.useFakeTimers();
      const page = tapOpenInPinch();
      page.document.hidden = true;
      page.fire('document:visibilitychange');
      page.document.hidden = false; // back in Safari before the timer runs
      vi.advanceTimersByTime(5000);
      expect(page.location.href).toBe(`pinch://s/${TOKEN}`);
    });
  });

  it('writes the page in the chosen language and direction', () => {
    const html = renderSharePage(recipe, TOKEN, 'he');
    expect(html).toContain('<html lang="he" dir="rtl">');
    expect(html).toContain('מרכיבים');
    expect(html).toContain('Crispy &lt;Chili&gt; Oil Noodles');
  });
});

describe('Night Market look (ADR 031)', () => {
  it('takes its colours from the default theme pack, in light and dark', () => {
    const html = renderSharePage(recipe, TOKEN);
    const pack = ThemePacks[DEFAULT_THEME_PACK];
    expect(html).toContain(`--bg:${pack.light.background}`);
    expect(html).toContain(`--primary:${pack.light.primary}`);
    expect(html).toContain(`@media (prefers-color-scheme:dark){:root{--bg:${pack.dark.background}`);
    expect(html).toContain(`<meta name="theme-color" media="(prefers-color-scheme: dark)" content="${pack.dark.background}" />`);
  });

  it('loads Inter and Space Grotesk from the site itself', () => {
    const html = renderSharePage(recipe, TOKEN);
    expect(html).toContain('src:url(/fonts/inter-latin-wght-normal.woff2)');
    expect(html).toContain('font-family:"Space Grotesk"');
    expect(html).not.toContain('fonts.googleapis.com');
  });

  it('shows the facts as tiles, value over label', () => {
    const html = renderSharePage({ ...recipe, calories: 900 }, TOKEN);
    expect(html).toContain(
      '<ul class="facts"><li><b>15 min</b><span>Total time</span></li><li><b>2</b><span>Servings</span></li><li><b>3</b><span>Ingredients</span></li><li><b>~450</b><span>Cal / serving</span></li></ul>',
    );
  });

  it('puts each ingredient amount in its own column', () => {
    const html = renderSharePage(recipe, TOKEN);
    expect(html).toContain(
      '<li><label><input type="checkbox" /><span class="amount"><bdi dir="ltr">⅓</bdi></span><span class="name" dir="auto">tbsp chili oil</span></label></li>',
    );
    expect(html).toContain('<span class="amount"></span><span class="name" dir="auto">salt</span>');
  });

  it('leaves out the photo tile when there is no photo', () => {
    expect(renderSharePage(recipe, TOKEN)).toContain('<figure class="photo">');
    expect(renderSharePage({ ...recipe, image_url: undefined }, TOKEN)).not.toContain('class="photo"');
  });

  it('sizes the headline by the length of the title', () => {
    expect(renderSharePage({ ...recipe, title: 'Shakshuka' }, TOKEN)).toContain('class="tile details t-s"');
    expect(renderSharePage(recipe, TOKEN)).toContain('class="tile details t-m"');
    expect(renderSharePage({ ...recipe, title: 'A'.repeat(40) }, TOKEN)).toContain('class="tile details"');
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
            {
              appIDs: ['V9W92RK5W6.com.pinch.myapp'],
              components: [
                { '/': '/s/*', comment: 'Shared recipes' },
                { '/': '/r/*', comment: 'Public Hub recipes' },
              ],
            },
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
    expect(link.target.sha256_cert_fingerprints).toHaveLength(2);
    for (const fingerprint of link.target.sha256_cert_fingerprints) {
      expect(fingerprint).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
    }
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
    expect(response?.headers.get('Referrer-Policy')).toBe('no-referrer');
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
