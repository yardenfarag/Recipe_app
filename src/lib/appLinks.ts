/** Hosts whose links the app claims (universal links / Android App Links, PIN-110, PIN-124). */
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
  // Public Hub recipe page (PIN-124): the Hub screen loads a card by its public slug too.
  const hub = /^\/r\/([^/]+)\/?$/.exec(url.pathname);
  if (hub) return `/hub/${hub[1]}`;
  // Only /s/* and /r/* are claimed; any other pinch-app.io page opens the library.
  return '/';
}
