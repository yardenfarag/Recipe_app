/**
 * The in-app path a push notification carries in `data.url` ('/add', '/recipe/<id>'), if it is one.
 * Only paths inside the app: no other sites, no protocol-relative `//host` links.
 */
export function notificationPath(data: unknown): string | null {
  const url = (data as { url?: unknown } | null | undefined)?.url;
  if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//') || url.includes('\\')) return null;
  return url;
}
