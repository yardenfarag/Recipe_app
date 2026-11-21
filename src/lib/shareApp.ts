import { Platform, Share } from 'react-native';

import { LEGAL_BASE_URL } from '@/lib/legal';
import {
  appShareMessage,
  appShareUrl as sharedAppShareUrl,
  shareAppInBrowser,
  type ShareAppResult,
} from '@shared/lib/shareApp';

export { appShareMessage, type ShareAppResult } from '@shared/lib/shareApp';

/** The landing page link with UTM tags for this platform (shared/lib/shareApp.ts). */
export function appShareUrl(platform: string = Platform.OS): string {
  return sharedAppShareUrl(LEGAL_BASE_URL, platform);
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
    return shareAppInBrowser({ title: options.title, message: options.message, url });
  }

  // Android ignores `url`; fold it into `message`. iOS uses `url` for the link preview.
  const result =
    Platform.OS === 'ios'
      ? await Share.share({ title: options.title, message: options.message.trim(), url })
      : await Share.share({ title: options.title, message: text });

  if (result.action === Share.dismissedAction) return 'dismissed';
  return 'shared';
}
