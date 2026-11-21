import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

import { storeUrlFor } from '@shared/lib/appStoreLinks';

export { APP_STORE_URL, PLAY_STORE_URL, storeUrlFor } from '@shared/lib/appStoreLinks';

export async function openAppStore(): Promise<void> {
  const userAgent = typeof navigator === 'undefined' ? '' : (navigator.userAgent ?? '');
  await Linking.openURL(storeUrlFor(Platform.OS, userAgent));
}
