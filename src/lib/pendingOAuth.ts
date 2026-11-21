/**
 * Web Google sign-in leaves the page, so the auth screen's in-memory state is gone when
 * /auth-callback loads. Remember why sign-in was opened so the callback can finish it.
 */
const KEY = 'pinch:pendingOAuthReason';

export function savePendingOAuthReason(reason: string | undefined): void {
  if (typeof window === 'undefined') return;
  try {
    if (reason) window.sessionStorage.setItem(KEY, reason);
    else window.sessionStorage.removeItem(KEY);
  } catch {
    // Storage blocked — the callback falls back to the home screen.
  }
}

const RETURN_KEY = 'pinch:pendingOAuthReturnTo';

/** The recipe page to come back to after web Google sign-in (see authReturnPath). */
export function savePendingOAuthReturnTo(path: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (path) window.sessionStorage.setItem(RETURN_KEY, path);
    else window.sessionStorage.removeItem(RETURN_KEY);
  } catch {
    // Storage blocked — the callback falls back to the home screen.
  }
}

export function takePendingOAuthReturnTo(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const path = window.sessionStorage.getItem(RETURN_KEY);
    window.sessionStorage.removeItem(RETURN_KEY);
    return path;
  } catch {
    return null;
  }
}

export function takePendingOAuthReason(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const reason = window.sessionStorage.getItem(KEY);
    window.sessionStorage.removeItem(KEY);
    return reason;
  } catch {
    return null;
  }
}
