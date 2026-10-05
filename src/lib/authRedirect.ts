import { makeRedirectUri } from 'expo-auth-session';
import { Platform } from 'react-native';

const AUTH_SCHEME = 'pinch';

/**
 * Target for OAuth / password-recovery redirects.
 * Native: pinch://…. Web: <origin>/app/… — the app is served under experiments.baseUrl,
 * which makeRedirectUri leaves out. Supabase only honours URLs on its Redirect URLs
 * allowlist and otherwise falls back to the Site URL (pinch://), a blank page in a browser.
 */
export function authRedirectUri(path: string): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const base = (process.env.EXPO_BASE_URL ?? '').replace(/\/+$/, '');
    return `${window.location.origin}${base}/${path.replace(/^\/+/, '')}`;
  }
  return makeRedirectUri({
    scheme: AUTH_SCHEME,
    path,
    preferLocalhost: false,
  });
}
