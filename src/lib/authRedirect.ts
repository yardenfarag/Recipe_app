import { makeRedirectUri } from 'expo-auth-session';

const AUTH_SCHEME = 'pinch';

/** Deep-link target for OAuth / password-recovery flows (production: pinch://…). */
export function authRedirectUri(path: string): string {
  return makeRedirectUri({
    scheme: AUTH_SCHEME,
    path,
    preferLocalhost: false,
  });
}
