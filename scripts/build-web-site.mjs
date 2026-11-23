// Builds the pinch-app.io site into dist/:
//   /                static landing page (landing/index.html) — real HTML for crawlers,
//                    with a card per guide in content/guides/*.md (scripts/site-pages.mjs)
//   /guides/<name>/  a page per guide, from landing/guide.html
//   /<lang>/…        the landing page and the guides again in each other language
//                    (landing/strings/<lang>.json, content/guides/<lang>/*.md)
//   /sitemap.xml     public/sitemap.xml plus a URL per page per language
//   /llms.txt        landing/llms.txt with the guides filled in, for AI assistants
//   /<key>.txt       the IndexNow key (scripts/indexnow.mjs)
//   /app/            the Expo web app (experiments.baseUrl = "/app"). Nobody reaches it since PIN-147: the pinch-web
//                    Worker's routes take /app. It stays as the way back until PIN-148 (docs/WEB-APP-SWITCH.md).
//   /*.html          legal pages
//   /support.js      the Contact support form every page opens
//   /404.html        the Expo app shell, so /app/<route> deep links load it when switched back.
//                    Its inline script sends old root links (/auth-callback…) to /app/…, on to whichever app has /app.
import { execSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { contentHashWebChunks } from './content-hash-web-chunks.mjs';
import { INDEXNOW_KEY } from './indexnow.mjs';
import { buildLlmsTxt, buildSitemap, buildSitePages, fillSupabaseConfig, loadSite } from './site-pages.mjs';

const root = join(import.meta.dirname, '..');
const dist = join(root, 'dist');

try {
  process.loadEnvFile(join(root, '.env'));
} catch {
  // CI passes env directly.
}

rmSync(dist, { recursive: true, force: true });
execSync('npx expo export -p web --output-dir dist/app', { cwd: root, stdio: 'inherit' });
// Before 404.html is copied from the app shell, so both point at the renamed files.
const renamed = contentHashWebChunks(join(dist, 'app'));
console.log(`Content-hashed ${Object.keys(renamed).length} web JS files.`);

const copy = (from, to = from.split('/').pop()) => copyFileSync(join(root, from), join(dist, to));

copy('legal/privacy.html');
copy('legal/terms.html');
copy('legal/refund.html');
copy('legal/delete-account.html');
copy('legal/delete-data.html');
copy('legal/share.html');
copy('legal/code.html');
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
// The App Store and Google Play badges, one of each per language: /badges/app-store-<lang>.svg.
cpSync(join(root, 'landing/badges'), join(dist, 'badges'), { recursive: true });
// Inter and Space Grotesk (SIL OFL), for the share Worker's recipe pages: /fonts/<file>.woff2. Same origin, no Google.
cpSync(join(root, 'landing/fonts'), join(dist, 'fonts'), { recursive: true });
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
for (const script of ['support.js', 'track.js']) {
  writeFileSync(
    join(dist, script),
    fillSupabaseConfig(
      readFileSync(join(root, 'landing', script), 'utf8'),
      process.env.EXPO_PUBLIC_SUPABASE_URL,
      process.env.EXPO_PUBLIC_SUPABASE_KEY,
    ),
  );
}
writeFileSync(join(dist, 'sitemap.xml'), buildSitemap(readFileSync(join(root, 'public/sitemap.xml'), 'utf8'), site));
writeFileSync(join(dist, 'llms.txt'), buildLlmsTxt(readFileSync(join(root, 'landing/llms.txt'), 'utf8'), site));
writeFileSync(join(dist, `${INDEXNOW_KEY}.txt`), INDEXNOW_KEY);

writeFileSync(join(dist, '.nojekyll'), '');
writeFileSync(join(dist, 'CNAME'), 'pinch-app.io\n');
