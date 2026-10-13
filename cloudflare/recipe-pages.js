/**
 * Serves r.pinch-app.io from the public-recipe Edge Function.
 *
 * The functions URL marks HTML as plain text, so a browser shows source.
 * This worker sets the real content type so the page renders.
 *
 * Dashboard → Workers → Settings → Variables:
 * SUPABASE_FUNCTION_URL = https://ccobefeofhnncpgifxel.supabase.co/functions/v1/public-recipe
 *
 * Leave pinch-app.io on GitHub Pages.
 */
const HTML_CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "script-src 'unsafe-inline'",
  "img-src 'none'",
  "media-src 'none'",
  "frame-src 'none'",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

export default {
  async fetch(request, env) {
    const incoming = new URL(request.url);
    const base = String(env.SUPABASE_FUNCTION_URL || '').replace(/\/$/, '');
    if (!base) return new Response('Recipe pages are not configured.', { status: 500 });
    const target = `${base}${incoming.pathname}${incoming.search}`;
    const upstream = await fetch(target, { method: request.method, redirect: 'manual' });
    const headers = new Headers(upstream.headers);
    const path = incoming.pathname;
    if (path === '/robots.txt') {
      headers.set('content-type', 'text/plain; charset=utf-8');
    } else if (path === '/sitemap.xml') {
      headers.set('content-type', 'application/xml; charset=utf-8');
    } else {
      headers.set('content-type', 'text/html; charset=utf-8');
      headers.set('content-security-policy', HTML_CSP);
    }
    return new Response(request.method === 'HEAD' ? null : upstream.body, {
      status: upstream.status,
      headers,
    });
  },
};
