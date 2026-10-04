import * as Linking from 'expo-linking';

export const APP_STORE_URL =
  'https://apps.apple.com/us/app/pinch-recipe-library/id6796310453';

export async function openAppStore(): Promise<void> {
  await Linking.openURL(APP_STORE_URL);
}
