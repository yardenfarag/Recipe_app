// Serves the static site (landing page, guide pages, legal pages) at http://localhost:8090,
// in every language (/es/, /he/…), rebuilding the pages on every request so edits to landing/
// and content/ show up on refresh (restart after changing scripts/site-pages.mjs). Uses .env
// for Supabase, so the support form sends real messages; page-view tracking is off on localhost.
// /app/ links go to the Expo dev server on :8081.
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';

import { buildSitemap, buildSitePages, fillSupabaseConfig, loadSite } from './site-pages.mjs';

const root = join(import.meta.dirname, '..');
const port = Number(process.env.PORT ?? 8090);

try {
  process.loadEnvFile(join(root, '.env'));
} catch {
  // No .env: the support form falls back to email.
}

const html = 'text/html; charset=utf-8';
// Same paths build-web-site.mjs copies into dist/.
const files = {
  '/site.css': ['landing/site.css', 'text/css; charset=utf-8'],
  '/hero-recipe.webp': ['landing/hero-recipe.webp', 'image/webp'],
  '/favicon.png': ['assets/images/favicon.png', 'image/png'],
  '/icon.png': ['assets/images/icon.png', 'image/png'],
  '/robots.txt': ['public/robots.txt', 'text/plain; charset=utf-8'],
  '/privacy.html': ['legal/privacy.html', html],
  '/terms.html': ['legal/terms.html', html],
  '/delete-account.html': ['legal/delete-account.html', html],
  '/delete-data.html': ['legal/delete-data.html', html],
  '/share.html': ['legal/share.html', html],
  '/styles.css': ['legal/styles.css', 'text/css; charset=utf-8'],
};

function render(path) {
  if (files[path]) {
    const [file, type] = files[path];
    return { type, body: readFileSync(join(root, file)) };
  }
  const site = loadSite(root);
  if (path === '/sitemap.xml') {
    const sitemap = readFileSync(join(root, 'public/sitemap.xml'), 'utf8');
    return { type: 'application/xml', body: buildSitemap(sitemap, site) };
  }
  const pages = buildSitePages(site, {
    landingHtml: readFileSync(join(root, 'landing/index.html'), 'utf8'),
    guideHtml: readFileSync(join(root, 'landing/guide.html'), 'utf8'),
  });
  const page = pages.find((p) => p.path === path.replace(/index\.html$/, ''));
  if (!page) return null;
  return {
    type: html,
    body: fillSupabaseConfig(page.html, process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_KEY),
  };
}

createServer((req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path.startsWith('/app')) {
    res.writeHead(302, { Location: 'http://localhost:8081/' }).end();
    return;
  }
  try {
    const result = render(path);
    if (!result) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': result.type, 'Cache-Control': 'no-store' }).end(result.body);
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain' }).end(String(error?.stack ?? error));
  }
}).listen(port, () => {
  console.log(`Site preview: http://localhost:${port}/`);
});
