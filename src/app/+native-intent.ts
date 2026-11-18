import { getShareExtensionKey } from 'expo-share-intent';

import { appPathForWebLink } from '@/lib/appLinks';

/**
 * Rewrite share-extension deep links (pinch://dataUrl=pinchShareKey) into a
 * real route. Without this, Expo Router shows Unmatched Route first (ADR 010).
 */
export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}): string {
  try {
    if (path.includes(`dataUrl=${getShareExtensionKey()}`)) {
      return '/add';
    }
    // https://pinch-app.io/s/<token> opened as a universal link / App Link (PIN-110).
    return appPathForWebLink(path);
  } catch {
    return '/';
  }
}
