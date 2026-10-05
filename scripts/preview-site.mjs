// Serves the static site (landing page with guides, legal pages) at http://localhost:8090,
// rebuilding the landing page on every request so edits to landing/ and content/ show
// up on refresh (restart after changing scripts/site-pages.mjs). Uses .env for Supabase,
// so the support form sends real messages; page-view tracking is off on localhost.
// /app/ links go to the Expo dev server on :8081.
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';

import { buildLanding, fillSupabaseConfig } from './site-pages.mjs';

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
  '/sitemap.xml': ['public/sitemap.xml', 'application/xml'],
  '/privacy.html': ['legal/privacy.html', html],
  '/terms.html': ['legal/terms.html', html],
  '/delete-account.html': ['legal/delete-account.html', html],
  '/delete-data.html': ['legal/delete-data.html', html],
  '/share.html': ['legal/share.html', html],
  '/styles.css': ['legal/styles.css', 'text/css; charset=utf-8'],
};

function render(path) {
  if (path === '/' || path === '/index.html') {
    const landing = buildLanding(readFileSync(join(root, 'landing/index.html'), 'utf8'), join(root, 'content'));
    return {
      type: html,
      body: fillSupabaseConfig(landing, process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_KEY),
    };
  }
  if (!files[path]) return null;
  const [file, type] = files[path];
  return { type, body: readFileSync(join(root, file)) };
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
