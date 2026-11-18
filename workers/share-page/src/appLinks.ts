// Domain verification for universal links (iOS) and App Links (Android), PIN-110.
// With these, tapping https://pinch-app.io/s/<token> opens the app when it is installed.
// The apps must claim the same paths: app.json ios.associatedDomains and android.intentFilters.

const APPLE_TEAM_ID = 'V9W92RK5W6';
const BUNDLE_ID = 'com.pinch.myapp';
const ANDROID_PACKAGE = 'com.pinch.myapp';
const ANDROID_CERT_FINGERPRINTS = [
  // Play App Signing key (Play Console → Setup → App integrity). Store builds are signed with it.
  '97:EF:5E:2B:45:39:E1:63:0B:73:65:D9:A3:D0:F4:01:D6:DD:46:01:11:30:69:53:0A:F1:B5:06:54:70:53:79',
  // EAS upload keystore (`npx eas-cli credentials -p android`), for builds installed straight from EAS.
  'A0:1B:AB:AB:23:4D:7C:A2:D5:CE:B2:A8:A7:7B:E7:32:EF:20:4B:4C:7A:20:F8:04:E6:B9:CB:CE:66:74:4D:B0',
];

export const APPLE_APP_SITE_ASSOCIATION = {
  applinks: {
    details: [
      {
        appIDs: [`${APPLE_TEAM_ID}.${BUNDLE_ID}`],
        components: [{ '/': '/s/*', comment: 'Shared recipes' }],
      },
    ],
  },
};

export const ASSET_LINKS = [
  {
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: ANDROID_PACKAGE,
      sha256_cert_fingerprints: ANDROID_CERT_FINGERPRINTS,
    },
  },
];

const FILES: Record<string, unknown> = {
  '/.well-known/apple-app-site-association': APPLE_APP_SITE_ASSOCIATION,
  '/apple-app-site-association': APPLE_APP_SITE_ASSOCIATION,
  '/.well-known/assetlinks.json': ASSET_LINKS,
};

/** Serves the verification files as JSON with a 200 and no redirect, as both platforms require. */
export function handleAppLinkRequest(request: Request): Response | null {
  const { pathname } = new URL(request.url);
  const body = FILES[pathname];
  if (body === undefined) return null;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }
  return new Response(request.method === 'HEAD' ? null : JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
