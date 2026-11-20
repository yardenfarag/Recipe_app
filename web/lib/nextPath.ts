/**
 * Where to go after signing in. A signed-out visitor is sent to /auth?next=<the page they wanted>, so `next`
 * comes from the address bar and must only ever point inside this app.
 *
 * Paths are relative to the app (Next adds the /app base path), e.g. "/recipe/123?tab=steps".
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw) return "/";
  // Only same-app paths: "/x". Not "//evil.com", "/\evil.com" or "https://…", which browsers treat as other sites.
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  // Never send someone back to a sign-in page after signing in.
  const path = raw.split(/[?#]/)[0];
  if (path === "/auth" || path === "/auth-callback" || path.startsWith("/auth/")) return "/";
  return raw;
}

/** The sign-in address that brings the visitor back to `path` afterwards. */
export function signInPathFor(path: string): string {
  const next = safeNextPath(path);
  return next === "/" ? "/auth?mode=signin" : `/auth?mode=signin&next=${encodeURIComponent(next)}`;
}

// Google sign-in leaves the site and comes back to /auth-callback, so the page to return to is kept in
// sessionStorage for that one round trip.
const PENDING_NEXT_KEY = "pinch:pendingNext";

export function rememberNextPath(next: string): void {
  try {
    window.sessionStorage.setItem(PENDING_NEXT_KEY, safeNextPath(next));
  } catch {
    // Storage blocked: the callback goes to the home page.
  }
}

export function takeRememberedNextPath(): string {
  try {
    const next = window.sessionStorage.getItem(PENDING_NEXT_KEY);
    window.sessionStorage.removeItem(PENDING_NEXT_KEY);
    return safeNextPath(next);
  } catch {
    return "/";
  }
}
