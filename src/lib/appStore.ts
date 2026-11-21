import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

import { APP_STORE_URL, PLAY_STORE_URL } from '@shared/lib/appStoreLinks';

export { APP_STORE_URL, PLAY_STORE_URL } from '@shared/lib/appStoreLinks';

/** Android, native or an Android browser on the website, gets Google Play. */
export function storeUrlFor(platform: typeof Platform.OS, userAgent = ''): string {
  if (platform === 'android') return PLAY_STORE_URL;
  if (platform === 'web' && /android/i.test(userAgent)) return PLAY_STORE_URL;
  return APP_STORE_URL;
}

export async function openAppStore(): Promise<void> {
  const userAgent = typeof navigator === 'undefined' ? '' : (navigator.userAgent ?? '');
  await Linking.openURL(storeUrlFor(Platform.OS, userAgent));
}
