// Cloudflare Worker on pinch-app.io/s/* (PIN-9).
// GitHub Pages can only answer /s/<token> with 404.html, so this renders the share page —
// title, OG tags and Recipe schema — with a 200. Every other path goes to Pages untouched.

import {
  renderNotFoundPage,
  renderSharePage,
  renderUnavailablePage,
  type SharedRecipe,
} from './render';

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

  let token: string;
  try {
    token = decodeURIComponent(match[1]);
  } catch {
    return html(renderNotFoundPage(), 404, 'public, max-age=300');
  }
  if (!TOKEN_PATTERN.test(token)) return html(renderNotFoundPage(), 404, 'public, max-age=300');

  const share = await fetchShare(env, token);
  if (share.status === 'not_found') return html(renderNotFoundPage(), 404, 'public, max-age=300');
  if (share.status === 'error') {
    const response = html(renderUnavailablePage(token), 503, 'no-store');
    response.headers.set('Retry-After', '60');
    return response;
  }
  return html(renderSharePage(share.recipe, token), 200, 'public, max-age=300');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return (await handleShareRequest(request, env)) ?? fetch(request);
  },
};
