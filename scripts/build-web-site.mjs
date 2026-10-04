// Builds the pinch-app.io site into dist/:
//   /            static landing page (landing/index.html) — real HTML for crawlers
//   /app/        the Expo web app (experiments.baseUrl = "/app")
//   /*.html      legal pages
//   /404.html    the app shell, so /app/<route> deep links load the app.
//                Its inline script sends old root links (/s/…, /auth-callback…) to /app/….
import { execSync } from 'node:child_process';
import { copyFileSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

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
copy('legal/index.html', 'legal.html');
copy('public/robots.txt');
copy('public/sitemap.xml');
copy('assets/images/favicon.png');
copy('assets/images/icon.png');
copy('dist/app/index.html', '404.html');

const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_KEY ?? '';
let landing = readFileSync(join(root, 'landing/index.html'), 'utf8');
if (supabaseUrl && supabaseKey) {
  landing = landing.replace('__SUPABASE_URL__', supabaseUrl).replace('__SUPABASE_KEY__', supabaseKey);
}
writeFileSync(join(dist, 'index.html'), landing);

writeFileSync(join(dist, '.nojekyll'), '');
writeFileSync(join(dist, 'CNAME'), 'pinch-app.io\n');
