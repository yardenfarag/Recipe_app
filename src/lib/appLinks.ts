/** Hosts whose links the app claims (universal links / Android App Links, PIN-110). */
const APP_LINK_HOSTS = new Set(['pinch-app.io', 'www.pinch-app.io']);

/**
 * Turns a tapped https://pinch-app.io link into an app route. Expo Router hands
 * `+native-intent` either a path or a full URL, so both are accepted. Anything that is not
 * one of our web links is returned unchanged.
 */
export function appPathForWebLink(path: string): string {
  let url: URL;
  try {
    url = new URL(path);
  } catch {
    return path;
  }
  if (url.protocol !== 'https:' || !APP_LINK_HOSTS.has(url.hostname)) return path;

  const share = /^\/(?:app\/)?s\/([^/]+)\/?$/.exec(url.pathname);
  if (share) return `/s/${share[1]}`;
  // Only /s/* is claimed today; any other pinch-app.io page opens the library.
  return '/';
}
