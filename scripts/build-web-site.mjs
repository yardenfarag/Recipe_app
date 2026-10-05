// Builds the pinch-app.io site into dist/:
//   /            static landing page (landing/index.html) — real HTML for crawlers,
//                with the guides in content/guides/*.md rendered into it (scripts/site-pages.mjs)
//   /app/        the Expo web app (experiments.baseUrl = "/app")
//   /*.html      legal pages
//   /404.html    the app shell, so /app/<route> deep links load the app.
//                Its inline script sends old root links (/s/…, /auth-callback…) to /app/….
import { execSync } from 'node:child_process';
import { copyFileSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildLanding, fillSupabaseConfig } from './site-pages.mjs';

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
copy('legal/delete-account.html');
copy('legal/delete-data.html');
copy('legal/share.html');
copy('legal/styles.css');
copy('public/robots.txt');
copy('public/sitemap.xml');
copy('assets/images/favicon.png');
copy('assets/images/icon.png');
copy('landing/site.css');
copy('landing/hero-recipe.webp');
copy('dist/app/index.html', '404.html');

const landing = buildLanding(readFileSync(join(root, 'landing/index.html'), 'utf8'), join(root, 'content'));
writeFileSync(
  join(dist, 'index.html'),
  fillSupabaseConfig(landing, process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_KEY),
);

writeFileSync(join(dist, '.nojekyll'), '');
writeFileSync(join(dist, 'CNAME'), 'pinch-app.io\n');
