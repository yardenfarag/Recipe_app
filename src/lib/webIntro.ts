import * as Linking from 'expo-linking';

/** Browser flag set when someone chooses “Continue on the web”. */
export const WEB_INTRO_DISMISSED_KEY = 'pinch:webIntroDismissed';

export const APP_STORE_URL =
  'https://apps.apple.com/us/app/pinch-recipe-library/id6796310453';

export function isWebIntroDismissedValue(value: string | null): boolean {
  return value === 'true';
}

/** True for the web app’s front door, where the intro replaces the library. */
export function isAppHome(pathname: string): boolean {
  const path = (pathname.split('?')[0] || '/').replace(/\/$/, '') || '/';
  return path === '/' || path === '/index' || path === '/(tabs)' || path === '/(tabs)/index';
}

/**
 * First-time web visitors see the intro on `/`.
 * People who already continued, or who already finished setup in this browser, go straight in.
 */
export function shouldRedirectToWebIntro(input: {
  isWeb: boolean;
  ready: boolean;
  dismissed: boolean;
  onboardingCompleted: boolean;
  pathname: string;
}): boolean {
  if (!input.isWeb || !input.ready) return false;
  if (input.dismissed || input.onboardingCompleted) return false;
  return isAppHome(input.pathname);
}

export async function openAppStore(): Promise<void> {
  await Linking.openURL(APP_STORE_URL);
}
