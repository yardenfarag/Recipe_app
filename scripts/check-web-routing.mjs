// Checks who answers each kind of address on pinch-app.io (ADR 027, PIN-147):
//   /app and /app/*          the new web app (pinch-web Worker), or the Expo web app after switching back
//   /, guides, legal, sitemaps   GitHub Pages
//   /s/*, /r/*, app-link files   the share Worker
//   old root links (/auth-callback…) GitHub Pages' 404.html, which forwards them to /app/…
//
//   node scripts/check-web-routing.mjs                 expects the new web app at /app (default)
//   node scripts/check-web-routing.mjs --expect expo   expects the Expo web app (after switching back)
//   node scripts/check-web-routing.mjs --origin https://next.pinch-app.io --only-app
//
// Read-only: plain GETs, no sign-in. Exits 1 if any check fails. The deploy workflow runs it after each deploy;
// docs/WEB-APP-SWITCH.md runs it by hand when switching over and back.
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    expect: { type: 'string', default: 'next' },
    origin: { type: 'string', default: 'https://pinch-app.io' },
    'only-app': { type: 'boolean', default: false },
  },
});
if (values.expect !== 'next' && values.expect !== 'expo') {
  console.error('--expect must be "next" or "expo"');
  process.exit(2);
}
const origin = values.origin.replace(/\/+$/, '');

const NEXT_MARKER = '/app/_next/static';
const EXPO_MARKER = '/app/_expo/static';
const appMarker = values.expect === 'next' ? NEXT_MARKER : EXPO_MARKER;
const otherMarker = values.expect === 'next' ? EXPO_MARKER : NEXT_MARKER;

// One of each kind of old Expo web address. On the new app they are pages (200) or its "not found" (404);
// on GitHub Pages every deep link is 404.html, the Expo shell, so only the marker is checked there.
const APP_PATHS = [
  '/app',
  '/app/',
  '/app/recipe/00000000-0000-0000-0000-000000000000',
  '/app/recipe/edit',
  '/app/recipe/preview',
  '/app/hub',
  '/app/hub/00000000-0000-0000-0000-000000000000',
  '/app/s/not-a-real-token',
  '/app/add',
  '/app/list',
  '/app/cookbook',
  '/app/settings',
  '/app/settings/credits?checkout_id=test',
  '/app/settings/recipe',
  '/app/auth',
  '/app/auth-callback',
  '/app/reset-password',
  '/app/welcome',
  '/app/onboarding',
  '/app/first-recipes',
  '/app/admin/dashboard',
];

// Only the new app has these redirects (PIN-146); Expo serves its own pages there.
const NEXT_REDIRECTS = [
  ['/app/favorites', '/app/?favorites=1'],
  ['/app/legal/privacy', 'https://pinch-app.io/privacy.html'],
];

const failures = [];
let passed = 0;

// App pages follow redirects (Pages adds a trailing slash to /app, Next takes it off /app/); the rest don't.
async function get(path, follow = false) {
  const response = await fetch(origin + path, {
    redirect: follow ? 'follow' : 'manual',
    headers: { 'User-Agent': 'pinch-routing-check' },
  });
  const body = response.status >= 300 && response.status < 400 ? '' : await response.text();
  return { status: response.status, type: response.headers.get('content-type') ?? '', body, location: response.headers.get('location') };
}

async function check(path, test, follow = false) {
  try {
    const result = await get(path, follow);
    const problem = test(result);
    if (problem) failures.push(`${path}: ${problem} (HTTP ${result.status})`);
    else passed += 1;
  } catch (error) {
    failures.push(`${path}: ${error.message}`);
  }
}

const appPage = ({ status, body }) => {
  if (status >= 500) return 'server error';
  if (values.expect === 'next' && status !== 200 && status !== 404) return 'expected a page or "not found"';
  if (!body.includes(appMarker)) {
    return body.includes(otherMarker) ? `served by the ${values.expect === 'next' ? 'Expo' : 'new'} web app` : 'not the app';
  }
  return null;
};

const checks = APP_PATHS.map((path) => check(path, appPage, true));

if (values.expect === 'next') {
  for (const [path, target] of NEXT_REDIRECTS) {
    checks.push(
      check(path, ({ status, location }) => {
        if (status !== 307 && status !== 308) return 'expected a redirect';
        const resolved = new URL(location, origin + path).href;
        return resolved === new URL(target, origin).href ? null : `redirects to ${resolved}`;
      }),
    );
  }
}

if (!values['only-app']) {
  const ok = (status, contentType, marker) => (r) => {
    if (r.status !== status) return `expected HTTP ${status}`;
    if (!r.type.startsWith(contentType)) return `expected ${contentType}, got ${r.type}`;
    if (marker && !r.body.includes(marker)) return `missing ${JSON.stringify(marker)}`;
    if (r.body.includes(NEXT_MARKER)) return 'served by the new web app';
    return null;
  };
  checks.push(
    // GitHub Pages
    check('/', ok(200, 'text/html', '<h1')),
    check('/he/', ok(200, 'text/html', '<h1')),
    check('/guides/save-tiktok-recipes/', ok(200, 'text/html', '<h1')),
    check('/privacy.html', ok(200, 'text/html')),
    check('/terms.html', ok(200, 'text/html')),
    check('/sitemap.xml', ok(200, 'application/xml')),
    check('/llms.txt', ok(200, 'text/plain')),
    check('/robots.txt', ok(200, 'text/plain')),
    // Old root links: 404.html forwards them to /app/… in the browser.
    check('/auth-callback', ok(404, 'text/html', "'/app' + path")),
    check('/reset-password', ok(404, 'text/html', "'/app' + path")),
    // The share Worker. Unknown tokens and slugs get its own "not available" page.
    check('/s/not-a-real-token', ok(404, 'text/html', 'Pinch')),
    check('/r/not-a-real-slug', ok(404, 'text/html', 'Pinch')),
    check('/sitemap-recipes.xml', ok(200, 'application/xml')),
    check('/apple-app-site-association', ok(200, 'application/json', 'applinks')),
    check('/.well-known/apple-app-site-association', ok(200, 'application/json', 'applinks')),
    check('/.well-known/assetlinks.json', ok(200, 'application/json', 'com.pinch.myapp')),
  );
}

await Promise.all(checks);

const who = values.expect === 'next' ? 'the new web app' : 'the Expo web app';
if (failures.length) {
  console.error(`${failures.length} failed, ${passed} passed (${origin}, /app expected to be ${who}):`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log(`All ${passed} checks passed (${origin}, /app is ${who}).`);
