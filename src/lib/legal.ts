import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

const extra = Constants.expoConfig?.extra as
  | { legalBaseUrl?: string; supportEmail?: string }
  | undefined;

/** Public legal site base (no trailing slash). Hosted from /legal via GitHub Pages. */
export const LEGAL_BASE_URL = (
  process.env.EXPO_PUBLIC_LEGAL_BASE_URL ??
  extra?.legalBaseUrl ??
  'https://yardenfarag.github.io/Recipe_app'
).replace(/\/$/, '');

export const SUPPORT_EMAIL =
  process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? extra?.supportEmail ?? 'yarden.farag@gmail.com';

export const LEGAL_URLS = {
  home: `${LEGAL_BASE_URL}/`,
  privacy: `${LEGAL_BASE_URL}/privacy.html`,
  terms: `${LEGAL_BASE_URL}/terms.html`,
  deleteAccount: `${LEGAL_BASE_URL}/delete-account.html`,
  supportMailto: `mailto:${SUPPORT_EMAIL}`,
} as const;

export async function openLegalUrl(url: string): Promise<void> {
  if (url.startsWith('mailto:')) {
    await Linking.openURL(url);
    return;
  }
  await WebBrowser.openBrowserAsync(url);
}
