/** Pinch in the app stores. The website points here when it can't sell credits itself. */
export const APP_STORE_URL = 'https://apps.apple.com/us/app/pinch-recipe-library/id6796310453';

export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.pinch.myapp';

/** Android, native or an Android browser on the website, gets Google Play; everyone else the App Store. */
export function storeUrlFor(platform: string, userAgent = ''): string {
  if (platform === 'android') return PLAY_STORE_URL;
  if (platform === 'web' && /android/i.test(userAgent)) return PLAY_STORE_URL;
  return APP_STORE_URL;
}
