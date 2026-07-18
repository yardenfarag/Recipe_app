import type { ImageSource } from 'expo-image';

const TIKTOK_CDN = /tiktokcdn|tiktok\.com|byteoversea|ibyteimg|muscdn/i;
const INSTAGRAM_CDN = /cdninstagram|instagram\.com|fbcdn\.net|scontent/i;

/** Headers required by some social CDNs when loading thumbnails in the app. */
export function recipeImageHeaders(uri: string): Record<string, string> | undefined {
  if (TIKTOK_CDN.test(uri)) {
    return {
      Referer: 'https://www.tiktok.com/',
      'User-Agent': 'Mozilla/5.0 (compatible; Pinch/1.0)',
    };
  }

  if (INSTAGRAM_CDN.test(uri)) {
    return {
      Referer: 'https://www.instagram.com/',
      'User-Agent': 'Mozilla/5.0 (compatible; Pinch/1.0)',
    };
  }

  return undefined;
}

/** TikTok/Instagram CDNs often require a Referer before they'll serve thumbnails in mobile apps. */
export function recipeImageSource(uri: string): ImageSource {
  const headers = recipeImageHeaders(uri);
  if (headers) {
    return { uri, headers };
  }
  return { uri };
}
