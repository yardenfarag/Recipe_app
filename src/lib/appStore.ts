import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

export const APP_STORE_URL =
  'https://apps.apple.com/us/app/pinch-recipe-library/id6796310453';

export const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.pinch.myapp';

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
