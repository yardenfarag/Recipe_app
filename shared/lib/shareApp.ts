/**
 * "Share Pinch" from Settings. The link and message are the same in both apps; the mobile app opens the system
 * share sheet (src/lib/shareApp.ts), and any browser uses `shareAppInBrowser`.
 */

export type ShareAppResult = 'shared' | 'copied' | 'dismissed';

/**
 * Link a friend opens to get Pinch. It goes to the landing page rather than a store,
 * because the friend may not have the same phone. The page has the App Store button
 * and the web app, and it logs the UTM tags with its visit.
 */
export function appShareUrl(baseUrl: string, platform: string): string {
  const params = new URLSearchParams({
    utm_source: 'pinch_app',
    utm_medium: 'share',
    utm_campaign: 'share_pinch',
    utm_content: platform,
  });
  return `${baseUrl.replace(/\/$/, '')}/?${params.toString()}`;
}

/** Message text with the link on its own line, so chat apps show a preview. */
export function appShareMessage(message: string, url: string): string {
  const text = message.trim();
  return text ? `${text}\n${url}` : url;
}

/** The browser share sheet if there is one, otherwise copy the text. */
export async function shareAppInBrowser(options: {
  title: string;
  message: string;
  url: string;
}): Promise<ShareAppResult> {
  const { title, message, url } = options;
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text: message.trim(), url });
      return 'shared';
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return 'dismissed';
    }
  }
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(appShareMessage(message, url));
    return 'copied';
  }
  throw new Error('Clipboard unavailable');
}
