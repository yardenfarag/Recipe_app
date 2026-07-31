import { getShareExtensionKey } from 'expo-share-intent';

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
    return path;
  } catch {
    return '/';
  }
}
