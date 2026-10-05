import { Platform, Share } from 'react-native';

import { LEGAL_BASE_URL } from '@/lib/legal';

export type ShareAppResult = 'shared' | 'copied' | 'dismissed';

/**
 * Link a friend opens to get Pinch. It goes to the landing page rather than a store,
 * because the friend may not have the same phone. The page has the App Store button
 * and the web app, and it logs the UTM tags with its visit.
 */
export function appShareUrl(platform: string = Platform.OS): string {
  const params = new URLSearchParams({
    utm_source: 'pinch_app',
    utm_medium: 'share',
    utm_campaign: 'share_pinch',
    utm_content: platform,
  });
  return `${LEGAL_BASE_URL}/?${params.toString()}`;
}

/** Message text with the link on its own line, so chat apps show a preview. */
export function appShareMessage(message: string, url: string): string {
  const text = message.trim();
  return text ? `${text}\n${url}` : url;
}

/**
 * Mobile: system share sheet. The person can edit the text in the app they pick.
 * Web: the browser share sheet if there is one, otherwise copy the text.
 */
export async function shareApp(options: {
  title: string;
  message: string;
}): Promise<ShareAppResult> {
  const url = appShareUrl();
  const text = appShareMessage(options.message, url);

  if (Platform.OS === 'web') {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: options.title, text: options.message.trim(), url });
        return 'shared';
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return 'dismissed';
      }
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return 'copied';
    }
    throw new Error('Clipboard unavailable');
  }

  // Android ignores `url`; fold it into `message`. iOS uses `url` for the link preview.
  const result =
    Platform.OS === 'ios'
      ? await Share.share({ title: options.title, message: options.message.trim(), url })
      : await Share.share({ title: options.title, message: text });

  if (result.action === Share.dismissedAction) return 'dismissed';
  return 'shared';
}
