// Cloudflare Worker on pinch-app.io/s/* and pinch-app.io/.well-known/* (PIN-9, PIN-110).
// GitHub Pages can only answer /s/<token> with 404.html, so this renders the share page —
// title, OG tags and Recipe schema — with a 200. It also serves the app-link verification
// files (appLinks.ts). Every other path goes to Pages untouched.

import { handleAppLinkRequest } from './appLinks';
import {
  renderNotFoundPage,
  renderSharePage,
  renderUnavailablePage,
  type SharedRecipe,
} from './render';
import { pickLanguage } from './strings';

export interface Env {
  SUPABASE_URL: string;
  /** Publishable/anon key — the same one shipped in the web bundle. */
  SUPABASE_KEY: string;
}

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

export async function handleShareRequest(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const match = /^\/s\/([^/]+)\/?$/.exec(url.pathname);
  if (!match) return null;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }

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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleAppLinkRequest(request) ?? (await handleShareRequest(request, env)) ?? fetch(request);
  },
};
