// Builds the pinch-app.io site into dist/:
//   /                static landing page (landing/index.html) — real HTML for crawlers,
//                    with a card per guide in content/guides/*.md (scripts/site-pages.mjs)
//   /guides/<name>/  a page per guide, from landing/guide.html
//   /<lang>/…        the landing page and the guides again in each other language
//                    (landing/strings/<lang>.json, content/guides/<lang>/*.md)
//   /sitemap.xml     public/sitemap.xml plus a URL per page per language
//   /app/            the Expo web app (experiments.baseUrl = "/app")
//   /*.html          legal pages
//   /support.js      the Contact support form every page opens
//   /404.html        the app shell, so /app/<route> deep links load the app.
//                    Its inline script sends old root links (/s/…, /auth-callback…) to /app/….
import { execSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildSitemap, buildSitePages, fillSupabaseConfig, loadSite } from './site-pages.mjs';

const root = join(import.meta.dirname, '..');
const dist = join(root, 'dist');

try {
  process.loadEnvFile(join(root, '.env'));
} catch {
  // CI passes env directly.
}

rmSync(dist, { recursive: true, force: true });
execSync('npx expo export -p web --output-dir dist/app', { cwd: root, stdio: 'inherit' });

const copy = (from, to = from.split('/').pop()) => copyFileSync(join(root, from), join(dist, to));

copy('legal/privacy.html');
copy('legal/terms.html');
copy('legal/refund.html');
copy('legal/delete-account.html');
copy('legal/delete-data.html');
copy('legal/share.html');
copy('legal/styles.css');
copy('public/robots.txt');
copy('assets/images/favicon.png');
copy('assets/images/icon.png');
copy('landing/site.css');
copy('landing/hero-recipe.webp');
copy('landing/og-image.jpg');
copy('landing/manifest.json');
copy('landing/icon-192.png');
copy('landing/icon-512.png');
copy('dist/app/index.html', '404.html');

const site = loadSite(root);
const pages = buildSitePages(site, {
  landingHtml: readFileSync(join(root, 'landing/index.html'), 'utf8'),
  guideHtml: readFileSync(join(root, 'landing/guide.html'), 'utf8'),
});
for (const page of pages) {
  const dir = join(dist, page.path);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'index.html'),
    fillSupabaseConfig(page.html, process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_KEY),
  );
}
writeFileSync(
  join(dist, 'support.js'),
  fillSupabaseConfig(
    readFileSync(join(root, 'landing/support.js'), 'utf8'),
    process.env.EXPO_PUBLIC_SUPABASE_URL,
    process.env.EXPO_PUBLIC_SUPABASE_KEY,
  ),
);
writeFileSync(join(dist, 'sitemap.xml'), buildSitemap(readFileSync(join(root, 'public/sitemap.xml'), 'utf8'), site));

writeFileSync(join(dist, '.nojekyll'), '');
writeFileSync(join(dist, 'CNAME'), 'pinch-app.io\n');
