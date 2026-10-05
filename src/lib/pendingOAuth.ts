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
