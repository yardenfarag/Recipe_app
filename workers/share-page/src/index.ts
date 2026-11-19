// Cloudflare Worker on pinch-app.io/s/*, /r/*, /sitemap-recipes.xml and /.well-known/*
// (PIN-9, PIN-110, PIN-124). GitHub Pages can only answer these paths with 404.html, so this
// renders them with a 200: private share pages (/s/, noindex), public Hub recipe pages (/r/,
// indexed) and the recipe sitemap. It also serves the app-link verification files
// (appLinks.ts) and, once a day, sends changed Hub pages to IndexNow. Every other path goes to
// Pages untouched.

import { handleAppLinkRequest } from './appLinks';
import { fetchHubRecipe, fetchIndexableCards, isIndexable, recipeSitemap, submitChangedRecipes, type SupabaseEnv } from './hub';
import {
  hubPageUrl,
  renderHubPage,
  renderNotFoundPage,
  renderSharePage,
  renderUnavailablePage,
  type SharedRecipe,
} from './render';
import { pickLanguage } from './strings';

export type Env = SupabaseEnv;

// recipe-share tokens are 18 random bytes, base64url (24 chars).
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

type ShareLookup = { status: 'ok'; recipe: SharedRecipe } | { status: 'not_found' } | { status: 'error' };

export async function fetchShare(env: Env, token: string): Promise<ShareLookup> {
  const base = (env.SUPABASE_URL ?? '').replace(/\/$/, '');
  if (!base || !env.SUPABASE_KEY) return { status: 'error' };

  try {
    const response = await fetch(`${base}/functions/v1/recipe-share`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.SUPABASE_KEY,
        Authorization: `Bearer ${env.SUPABASE_KEY}`,
      },
      body: JSON.stringify({ action: 'get', token }),
    });
    if (response.status === 404) return { status: 'not_found' };
    if (!response.ok) return { status: 'error' };
    const data = (await response.json()) as { recipe?: SharedRecipe };
    if (!data.recipe || typeof data.recipe.title !== 'string') return { status: 'error' };
    return { status: 'ok', recipe: data.recipe };
  } catch {
    return { status: 'error' };
  }
}

function html(body: string, status: number, cacheControl: string): Response {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': cacheControl,
      'X-Content-Type-Options': 'nosniff',
      // Share links are private by intent: never in search results (PIN-110).
      'X-Robots-Tag': 'noindex',
      // Links out (store, source video) don't carry the share token.
      'Referrer-Policy': 'no-referrer',
      // The page text follows the browser language.
      Vary: 'Accept-Language',
    },
  });
}

/**
 * Headers for a Hub page. One language per URL (the recipe's own), so search engines see the
 * same page every crawl. Creators see the visit came from pinch-app.io.
 */
function hubHtml(body: string, status: number, cacheControl: string, indexable: boolean): Response {
  const headers: Record<string, string> = {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': cacheControl,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  };
  if (!indexable) headers['X-Robots-Tag'] = 'noindex';
  return new Response(body, { status, headers });
}

function methodNotAllowed(): Response {
  return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
}

export async function handleHubRequest(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const match = /^\/r\/([^/]+)\/?$/.exec(url.pathname);
  if (!match) return null;
  if (request.method !== 'GET' && request.method !== 'HEAD') return methodNotAllowed();

  const notFound = () => hubHtml(renderNotFoundPage('en', 'hub'), 404, 'public, max-age=300', false);
  let slug: string;
  try {
    slug = decodeURIComponent(match[1]).toLowerCase();
  } catch {
    return notFound();
  }

  const lookup = await fetchHubRecipe(env, slug);
  if (lookup.status === 'not_found') return notFound();
  if (lookup.status === 'error') {
    const response = hubHtml(renderNotFoundPage('en', 'hub'), 503, 'no-store', false);
    response.headers.set('Retry-After', '60');
    return response;
  }

  const { recipe } = lookup;
  // One URL per recipe: an old title, a trailing slash or upper case goes to the canonical slug.
  if (url.pathname !== `/r/${encodeURIComponent(recipe.public_slug)}`) {
    return new Response(null, {
      status: 301,
      headers: { Location: hubPageUrl(recipe), 'Cache-Control': 'public, max-age=86400' },
    });
  }
  const indexable = isIndexable(recipe);
  const lang = pickLanguage(null, recipe.source_language);
  return hubHtml(renderHubPage(recipe, lang, indexable), 200, 'public, max-age=3600', indexable);
}

export async function handleSitemapRequest(request: Request, env: Env): Promise<Response | null> {
  if (new URL(request.url).pathname !== '/sitemap-recipes.xml') return null;
  if (request.method !== 'GET' && request.method !== 'HEAD') return methodNotAllowed();
  const cards = await fetchIndexableCards(env);
  if (!cards) return new Response('Sitemap unavailable', { status: 503, headers: { 'Retry-After': '300' } });
  return new Response(request.method === 'HEAD' ? null : recipeSitemap(cards), {
    status: 200,
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
}

export async function handleShareRequest(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const match = /^\/s\/([^/]+)\/?$/.exec(url.pathname);
  if (!match) return null;
  if (request.method !== 'GET' && request.method !== 'HEAD') return methodNotAllowed();

  const acceptLanguage = request.headers.get('Accept-Language');
  const notFound = () => html(renderNotFoundPage(pickLanguage(acceptLanguage)), 404, 'public, max-age=300');

  let token: string;
  try {
    token = decodeURIComponent(match[1]);
  } catch {
    return notFound();
  }
  if (!TOKEN_PATTERN.test(token)) return notFound();

  const share = await fetchShare(env, token);
  if (share.status === 'not_found') return notFound();
  if (share.status === 'error') {
    const response = html(renderUnavailablePage(token, pickLanguage(acceptLanguage)), 503, 'no-store');
    response.headers.set('Retry-After', '60');
    return response;
  }
  // Revoking a link must take effect quickly, so caches keep a page for a minute at most.
  const lang = pickLanguage(acceptLanguage, share.recipe.source_language);
  return html(renderSharePage(share.recipe, token, lang), 200, 'public, max-age=60');
}

/** How far back the daily IndexNow run looks: a day plus slack for a late or failed run. */
const INDEXNOW_WINDOW_MS = 26 * 60 * 60 * 1000;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return (
      handleAppLinkRequest(request) ??
      (await handleShareRequest(request, env)) ??
      (await handleHubRequest(request, env)) ??
      (await handleSitemapRequest(request, env)) ??
      fetch(request)
    );
  },

  // Cron trigger (wrangler.toml): new and changed Hub recipes reach Bing within hours.
  async scheduled(controller: { scheduledTime: number }, env: Env): Promise<void> {
    console.log(await submitChangedRecipes(env, new Date(controller.scheduledTime - INDEXNOW_WINDOW_MS)));
  },
};
